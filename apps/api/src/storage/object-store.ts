import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * DocStruct's object store (SI-3). Files live on disk under `root`, addressed by an opaque key, and are
 * reachable from the browser only through short-lived URLs signed with an HMAC (SE-13, CI-4): the API
 * issues the URL after its permission checks, and the browser then transfers the bytes directly.
 *
 * Objects are write-once. A key that already exists can never be overwritten, which is what makes a stored
 * version's content immutable (CO-7, SA-4). Uploads are written to a temporary file and renamed into place
 * only when complete, so an interrupted transfer never leaves a partial object (Robustness-1).
 */

export type SignedOp = 'get' | 'put';

export interface SignedParams {
  op: SignedOp;
  key: string;
  exp: number;
  /** put: maximum accepted size in bytes. */
  max?: number;
  /** get: response Content-Type, file name and disposition. */
  ct?: string;
  fn?: string;
  disp?: 'inline' | 'attachment';
}

export class ObjectStore {
  constructor(
    private readonly root: string,
    private readonly secret: string,
    private readonly ttlSeconds: number,
    private readonly urlBase: string,
  ) {}

  private pathFor(key: string): string {
    if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes('..')) throw new Error(`invalid object key: ${key}`);
    return path.join(this.root, ...key.split('/'));
  }

  private signature(p: SignedParams): string {
    const canonical = [p.op, p.key, p.exp, p.max ?? '', p.ct ?? '', p.fn ?? '', p.disp ?? ''].join('\n');
    return createHmac('sha256', this.secret).update(canonical).digest('base64url');
  }

  private url(p: SignedParams): string {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) if (v !== undefined) query.set(k, String(v));
    query.set('sig', this.signature(p));
    return `${this.urlBase}/storage/object?${query.toString()}`;
  }

  private expiry(): number {
    return Math.floor(Date.now() / 1000) + this.ttlSeconds;
  }

  /** A URL the browser can PUT one file to, at most `maxBytes` long. */
  createUploadUrl(key: string, maxBytes: number): string {
    return this.url({ op: 'put', key, exp: this.expiry(), max: maxBytes });
  }

  /** A URL the browser can GET the object from, inline (preview) or as an attachment (download). */
  createDownloadUrl(key: string, opts: { contentType: string; fileName: string; disposition: 'inline' | 'attachment' }) {
    return this.url({ op: 'get', key, exp: this.expiry(), ct: opts.contentType, fn: opts.fileName, disp: opts.disposition });
  }

  /** Checks signature and expiry of an incoming signed request. Constant-time comparison. */
  verify(params: SignedParams, sig: string): 'ok' | 'expired' | 'invalid' {
    const expected = Buffer.from(this.signature(params));
    const given = Buffer.from(sig ?? '');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 'invalid';
    if (params.exp < Math.floor(Date.now() / 1000)) return 'expired';
    return 'ok';
  }

  async exists(key: string): Promise<boolean> {
    return (await this.size(key)) !== null;
  }

  async size(key: string): Promise<number | null> {
    try {
      return (await stat(this.pathFor(key))).size;
    } catch {
      return null;
    }
  }

  /** Streams `body` into a new object. Fails if the key exists or more than `maxBytes` arrive. */
  async write(key: string, body: Readable, maxBytes: number): Promise<number> {
    const target = this.pathFor(key);
    if (await this.exists(key)) throw new ObjectExistsError(key);
    await mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${randomUUID()}.part`;
    let received = 0;
    try {
      await pipeline(
        body,
        async function* limit(source: AsyncIterable<Buffer>) {
          for await (const chunk of source) {
            received += chunk.length;
            if (received > maxBytes) throw new ObjectTooLargeError(maxBytes);
            yield chunk;
          }
        },
        createWriteStream(temp, { flags: 'wx' }),
      );
      if (await this.exists(key)) throw new ObjectExistsError(key);
      await rename(temp, target);
      return received;
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
  }

  async writeBuffer(key: string, data: Buffer): Promise<void> {
    const { Readable } = await import('node:stream');
    await this.write(key, Readable.from([data]), data.length);
  }

  read(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  stream(key: string): Readable {
    return createReadStream(this.pathFor(key));
  }

  async checksum(key: string): Promise<string> {
    const hash = createHash('sha256');
    await pipeline(this.stream(key), hash);
    return hash.digest('hex');
  }

  /**
   * Removes an object. Used only to clean up a file whose database transaction failed
   * (Doc.Upload.Failure, Reliability-2) - never for a file a version refers to.
   */
  async removeOrphan(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}

export class ObjectExistsError extends Error {
  constructor(key: string) {
    super(`object already exists: ${key}`);
  }
}

export class ObjectTooLargeError extends Error {
  constructor(readonly limit: number) {
    super(`upload exceeds ${limit} bytes`);
  }
}
