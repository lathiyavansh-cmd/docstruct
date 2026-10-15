/**
 * What this file does
 *   Runs the two-step file upload. It first hands out a short-lived signed upload URL, then checks the
 *   stored file when the document or version is created.
 *
 * How it works
 *   - issue() checks the file type and size, saves an upload ticket row and returns a signed PUT URL.
 *   - consume() marks the ticket as used (once only, not expired), checks the file exists, checks its
 *     bytes match the format, and returns its size and checksum.
 *   - safeFileName() strips unsafe characters from the user's file name before it is stored.
 *
 * Where it fits
 *   Used by documents/service.ts (new documents), versions/service.ts (new versions) and the seed
 *   script. Uses content.ts and the object store. Module: M03 Document & Folder Management (owner: Shrut).
 */
import { randomUUID } from 'node:crypto';
import { MAX_UPLOAD_BYTES, formatBytes, formatForFileName, type FileFormat, type UploadTicketDto } from '@docstruct/shared';
import type { AppContext } from '../../context.js';
import type { Queryable } from '../../db/database.js';
import { HttpError, badRequest, payloadTooLarge, unsupported } from '../../lib/errors.js';
import { contentMatchesFormat } from './content.js';

const TICKET_MINUTES = 30;

export interface StoredUpload {
  storageKey: string;
  fileName: string;
  format: FileFormat;
  byteSize: number;
  checksum: string;
}

/** Doc.Upload.Format: the accepted formats, listed in error messages. */
export function acceptedFormats(): string {
  return 'PDF, DOCX, TXT, MD, PNG or JPEG';
}

export function safeFileName(name: string): string {
  // Keep letters, digits, _, dot, dash and space; replace the rest with "_" and keep at most the last 120 chars.
  const cleaned = name.normalize('NFKC').replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, ' ').trim();
  return cleaned.slice(-120) || 'file';
}

/**
 * Two-step upload (CI-4: the file goes straight from the browser to the object store).
 *  1. issue()   - checks format and size before anything is sent (Doc.Upload.Size) and returns a signed URL;
 *  2. consume() - inside the caller's transaction, verifies the stored object and hands back its facts.
 */
export class UploadService {
  constructor(private readonly ctx: AppContext) {}

  async issue(projectId: string, userId: string, fileName: string, byteSize: number): Promise<UploadTicketDto> {
    const format = formatForFileName(fileName);
    if (!format) throw unsupported(`"${fileName}" is not a supported format. Upload a ${acceptedFormats()} file.`);
    if (byteSize > MAX_UPLOAD_BYTES) {
      throw payloadTooLarge(`Files can be at most ${formatBytes(MAX_UPLOAD_BYTES)}; this one is ${formatBytes(byteSize)}.`);
    }
    if (byteSize <= 0) throw badRequest('The file is empty');

    // A random UUID in the key makes every upload unique, even when two files share a name.
    const storageKey = `p/${projectId}/${randomUUID()}/${safeFileName(fileName).replace(/ /g, '_')}`;
    const expiresAt = new Date(Date.now() + TICKET_MINUTES * 60_000);
    await this.ctx.db.query(
      `INSERT INTO upload_tickets (storage_key, project_id, user_id, file_name, mime_type, declared_size, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [storageKey, projectId, userId, safeFileName(fileName), format.mime, byteSize, expiresAt],
    );
    return {
      uploadKey: storageKey,
      uploadUrl: this.ctx.storage.createUploadUrl(storageKey, byteSize),
      method: 'PUT',
      maxBytes: byteSize,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /** Marks the ticket used and returns the verified upload. Throws (rolling back the caller) on any problem. */
  async consume(q: Queryable, storageKey: string, projectId: string, userId: string): Promise<StoredUpload> {
    // One UPDATE both checks and uses the ticket: it must belong to this project and user, be unused and
    // not expired. Setting consumed_at means the same ticket cannot be used twice.
    const { rows } = await q.query<{ file_name: string; mime_type: string }>(
      `UPDATE upload_tickets SET consumed_at = now()
        WHERE storage_key = $1 AND project_id = $2 AND user_id = $3 AND consumed_at IS NULL AND expires_at > now()
        RETURNING file_name, mime_type`,
      [storageKey, projectId, userId],
    );
    const ticket = rows[0];
    if (!ticket) throw new HttpError(400, 'INVALID_UPLOAD', 'This upload is unknown, expired or already used. Upload the file again.');

    const byteSize = await this.ctx.storage.size(storageKey);
    if (byteSize === null) throw new HttpError(400, 'UPLOAD_INCOMPLETE', 'The file did not finish uploading. Please try again.');

    const format = formatForFileName(ticket.file_name)!;
    // Only the first 64 KB are checked against the format's signature; a mismatch deletes the stored file.
    const head = (await this.ctx.storage.read(storageKey)).subarray(0, 64 * 1024);
    if (!contentMatchesFormat(head, format)) {
      await this.ctx.storage.removeOrphan(storageKey);
      throw unsupported(`The file's contents are not a valid ${format.label} file.`);
    }
    return { storageKey, fileName: ticket.file_name, format, byteSize, checksum: await this.ctx.storage.checksum(storageKey) };
  }
}
