/**
 * What this file does
 *   Stores uploaded files on disk and creates signed, short-lived links to upload or download them.
 *   The design rules are in the block comment below.
 *
 * How it works
 *   - pathFor() turns a key into a safe file path; signature() makes an HMAC over the link fields.
 *   - createUploadUrl() / createDownloadUrl() build signed links; verify() checks them.
 *   - write() streams a file to a temp file with a size limit, then renames it into place.
 *   - read(), stream(), checksum() and removeOrphan() are used by services and the extractor.
 *   - With a database handle (STORAGE_DRIVER=database) the bytes live in the stored_objects table
 *     instead of on disk, so files survive on hosts whose disk is wiped on restart (such as Render).
 *
 * Where it fits
 *   Created in bootstrap.ts. Used by storage/routes.ts, the document and version services,
 *   and the extractor. Module: storage, shared core (owner: Vansh).
 */
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Queryable } from '../db/database.js';

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
    /** When given, file bytes are kept in the stored_objects table of this database instead of on disk. */
    private readonly db: Queryable | null = null,
  ) {}

  /** Where file bytes are kept: on disk under root, or in the database. */
  get driver(): 'filesystem' | 'database' {
    return this.db ? 'database' : 'filesystem';
  }

  private checkKey(key: string): void {
    // Security check: only safe characters and no '..', so a key can never point outside root
    // (this blocks path traversal attacks like "../../etc/passwd").
    if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes('..')) throw new Error(`invalid object key: ${key}`);
  }

  private pathFor(key: string): string {
    this.checkKey(key);
    return path.join(this.root, ...key.split('/'));
  }

  private signature(p: SignedParams): string {
    // Every field of the link is signed, so changing any of them (key, expiry, size) breaks the signature.
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
    // timingSafeEqual takes the same time whether the first or last byte differs,
    // so an attacker cannot guess the signature by measuring response times.
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 'invalid';
    if (params.exp < Math.floor(Date.now() / 1000)) return 'expired';
    return 'ok';
  }

  /**
   * Runs `fn` with a filesystem path to the object, for server-side tools such as the Python text
   * extractor. On disk that is the file itself; from the database the bytes are copied to a temporary
   * file that is deleted afterwards.
   */
  async withLocalFile<T>(key: string, fn: (filePath: string) => Promise<T>): Promise<T> {
    if (!this.db) return fn(this.pathFor(key));
    const dir = await mkdtemp(path.join(tmpdir(), 'docstruct-'));
    const file = path.join(dir, 'object');
    try {
      await writeFile(file, await this.read(key));
      return await fn(file);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.size(key)) !== null;
  }

  async size(key: string): Promise<number | null> {
    if (this.db) {
      this.checkKey(key);
      const { rows } = await this.db.query<{ size: number }>('SELECT octet_length(data)::int AS size FROM stored_objects WHERE key = $1', [key]);
      return rows[0]?.size ?? null;
    }
    try {
      return (await stat(this.pathFor(key))).size;
    } catch {
      return null;
    }
  }

  /** Streams `body` into a new object. Fails if the key exists or more than `maxBytes` arrive. */
  async write(key: string, body: Readable, maxBytes: number): Promise<number> {
    if (this.db) return this.writeToDatabase(key, body, maxBytes);
    const target = this.pathFor(key);
    if (await this.exists(key)) throw new ObjectExistsError(key);
    await mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${randomUUID()}.part`;
    let received = 0;
    try {
      await pipeline(
        body,
        // Counts bytes as they arrive and aborts as soon as the limit is passed,
        // instead of trusting the size the client claimed.
        async function* limit(source: AsyncIterable<Buffer>) {
          for await (const chunk of source) {
            received += chunk.length;
            if (received > maxBytes) throw new ObjectTooLargeError(maxBytes);
            yield chunk;
          }
        },
        createWriteStream(temp, { flags: 'wx' }),
      );
      // Check again: another upload with the same key may have finished while we were writing.
      if (await this.exists(key)) throw new ObjectExistsError(key);
      await rename(temp, target);
      return received;
    } catch (error) {
      // On any failure delete the half-written temp file so no partial object is left behind.
      await rm(temp, { force: true });
      throw error;
    }
  }

  /** Database storage: collects the upload in memory (within the size limit), then inserts it once. */
  private async writeToDatabase(key: string, body: Readable, maxBytes: number): Promise<number> {
    this.checkKey(key);
    if (await this.exists(key)) throw new ObjectExistsError(key);
    const chunks: Buffer[] = [];
    let received = 0;
    for await (const chunk of body as AsyncIterable<Buffer>) {
      received += chunk.length;
      if (received > maxBytes) throw new ObjectTooLargeError(maxBytes);
      chunks.push(chunk);
    }
    // ON CONFLICT DO NOTHING keeps objects write-once even if two uploads race for the same key.
    const { rows } = await this.db!.query<{ key: string }>(
      'INSERT INTO stored_objects (key, data) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING RETURNING key',
      [key, Buffer.concat(chunks)],
    );
    if (!rows[0]) throw new ObjectExistsError(key);
    return received;
  }

  async writeBuffer(key: string, data: Buffer): Promise<void> {
    await this.write(key, Readable.from([data]), data.length);
  }

  async read(key: string): Promise<Buffer> {
    if (!this.db) return readFile(this.pathFor(key));
    this.checkKey(key);
    const { rows } = await this.db.query<{ data: Uint8Array }>('SELECT data FROM stored_objects WHERE key = $1', [key]);
    if (!rows[0]) throw new Error(`object not found: ${key}`);
    return Buffer.from(rows[0].data);
  }

  stream(key: string): Readable {
    if (!this.db) return createReadStream(this.pathFor(key));
    const read = () => this.read(key);
    return Readable.from((async function* () {
      yield await read();
    })());
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
    if (this.db) {
      this.checkKey(key);
      await this.db.query('DELETE FROM stored_objects WHERE key = $1', [key]);
      return;
    }
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
