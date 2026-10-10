import type { DocumentDto, DocumentStatus, VersionDto } from '@docstruct/shared';
import type { AppContext } from '../../context.js';
import type { Queryable } from '../../db/database.js';
import { recordActivity } from '../../lib/activity.js';
import { HttpError, badRequest, notFound } from '../../lib/errors.js';
import { VERSION_COLUMNS, VERSION_JOINS, findDocument, toVersionDto, type VersionRow } from '../documents/queries.js';
import { UploadService, type StoredUpload } from '../documents/uploads.js';
import { allocateVersionNumber } from './allocate.js';

interface LockedDocument {
  project_id: string;
  title: string;
  status: DocumentStatus;
  current_version_id: string;
}

/**
 * Status after a new version is added (SRS Appendix B): an approval applied to the version that was reviewed,
 * not to the document forever, so a new version of an approved document returns it to Draft. A document
 * with requested changes keeps that status until the revision is resubmitted.
 */
export function statusAfterNewVersion(status: DocumentStatus): DocumentStatus {
  return status === 'APPROVED' ? 'DRAFT' : status;
}

/** M04 - Version Management (SRS 3.4). */
export class VersionService {
  private readonly uploads: UploadService;

  constructor(private readonly ctx: AppContext) {
    this.uploads = new UploadService(ctx);
  }

  /** Version.History.View: every version, newest first. */
  async history(documentId: string): Promise<VersionDto[]> {
    const { rows } = await this.ctx.db.query<VersionRow>(
      `SELECT ${VERSION_COLUMNS}
         FROM document_versions v JOIN documents d ON d.document_id = v.document_id ${VERSION_JOINS}
        WHERE v.document_id = $1
        ORDER BY v.version_no DESC`,
      [documentId],
    );
    return rows.map(toVersionDto);
  }

  /** Locks the document row and checks that a new version may be added. */
  private async lockForNewVersion(q: Queryable, documentId: string): Promise<LockedDocument> {
    const { rows } = await q.query<LockedDocument>(
      'SELECT project_id, title, status, current_version_id FROM documents WHERE document_id = $1 AND deleted_at IS NULL FOR UPDATE',
      [documentId],
    );
    const doc = rows[0];
    if (!doc) throw notFound('Document');
    if (doc.status === 'UNDER_REVIEW') {
      // The reviewer is examining a specific version; changing what is current underneath them would make
      // an approval refer to content nobody reviewed (SA-6).
      throw new HttpError(409, 'REVIEW_IN_PROGRESS', 'This document is under review. Cancel the review before adding a new version.');
    }
    if (doc.status === 'ARCHIVED') throw new HttpError(409, 'DOCUMENT_ARCHIVED', 'This document is archived and read-only');
    return doc;
  }

  private async setCurrent(q: Queryable, documentId: string, versionId: string, status: DocumentStatus) {
    await q.query('UPDATE documents SET current_version_id = $2, status = $3, updated_at = now() WHERE document_id = $1', [
      documentId,
      versionId,
      statusAfterNewVersion(status),
    ]);
  }

  /** Version.Create, Version.Number.Assign, Version.Current, Version.Note */
  async upload(documentId: string, userId: string, uploadKey: string, changeNote: string): Promise<DocumentDto> {
    let upload: StoredUpload | undefined;
    try {
      await this.ctx.db.tx(async (q) => {
        const doc = await this.lockForNewVersion(q, documentId);
        upload = await this.uploads.consume(q, uploadKey, doc.project_id, userId);
        const versionNo = await allocateVersionNumber(q, documentId);
        const { rows } = await q.query<{ version_id: string }>(
          `INSERT INTO document_versions
             (document_id, version_no, storage_key, file_name, mime_type, byte_size, checksum, change_note, uploaded_by, extraction_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING version_id`,
          [
            documentId,
            versionNo,
            upload.storageKey,
            upload.fileName,
            upload.format.mime,
            upload.byteSize,
            upload.checksum,
            changeNote,
            userId,
            upload.format.extractable ? 'PENDING' : 'UNSUPPORTED',
          ],
        );
        await this.setCurrent(q, documentId, rows[0].version_id, doc.status);
        await recordActivity(q, {
          projectId: doc.project_id,
          actorId: userId,
          action: 'version.uploaded',
          entityType: 'version',
          entityId: documentId,
          entityLabel: doc.title,
          detail: { versionNo, versionId: rows[0].version_id, fileName: upload.fileName, changeNote },
        });
      });
    } catch (error) {
      if (upload) await this.ctx.storage.removeOrphan(upload.storageKey);
      throw error;
    }
    return (await findDocument(this.ctx.db, documentId))!;
  }

  /**
   * Algorithm J - Version.Restore, Version.Restore.NewVersion. Restoration appends: a new version record
   * reuses the stored file (and extracted text) of the chosen version, so history grows by one entry and no
   * earlier version is deleted, renumbered or overwritten.
   */
  async restore(documentId: string, versionId: string, userId: string): Promise<DocumentDto> {
    await this.ctx.db.tx(async (q) => {
      const doc = await this.lockForNewVersion(q, documentId);
      const { rows } = await q.query<{
        version_id: string;
        version_no: number;
        storage_key: string;
        file_name: string;
        mime_type: string;
        byte_size: number;
        checksum: string;
        extraction_status: string;
        extracted_text: string | null;
      }>(
        `SELECT version_id, version_no, storage_key, file_name, mime_type, byte_size, checksum, extraction_status, extracted_text
           FROM document_versions WHERE version_id = $1 AND document_id = $2`,
        [versionId, documentId],
      );
      const source = rows[0];
      if (!source) throw notFound('Version');
      if (source.version_id === doc.current_version_id) throw badRequest('That version is already the current version');

      const versionNo = await allocateVersionNumber(q, documentId);
      const inserted = await q.query<{ version_id: string }>(
        `INSERT INTO document_versions
           (document_id, version_no, storage_key, file_name, mime_type, byte_size, checksum, change_note,
            restored_from_version_id, uploaded_by, extraction_status, extracted_text)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING version_id`,
        [
          documentId,
          versionNo,
          source.storage_key,
          source.file_name,
          source.mime_type,
          source.byte_size,
          source.checksum,
          `Restored from version ${source.version_no}`,
          source.version_id,
          userId,
          source.extraction_status,
          source.extracted_text,
        ],
      );
      await this.setCurrent(q, documentId, inserted.rows[0].version_id, doc.status);
      await recordActivity(q, {
        projectId: doc.project_id,
        actorId: userId,
        action: 'version.restored',
        entityType: 'version',
        entityId: documentId,
        entityLabel: doc.title,
        detail: { versionNo, restoredFrom: source.version_no, versionId: inserted.rows[0].version_id },
      });
    });
    return (await findDocument(this.ctx.db, documentId))!;
  }
}
