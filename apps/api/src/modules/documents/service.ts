import { formatForMime, type DocumentDetailDto, type DocumentDto, type FileLinkDto } from '@docstruct/shared';
import type { AppContext } from '../../context.js';
import { recordActivity } from '../../lib/activity.js';
import { notFound } from '../../lib/errors.js';
import { FolderService } from '../folders/service.js';
import { DOCUMENT_SELECT, findDocument, toDocumentDto, type DocumentRow } from './queries.js';
import { UploadService, type StoredUpload } from './uploads.js';

export interface ListFilter {
  folderId?: string | null;
  /** Filter.Folder: include the folder's descendants. */
  recursive?: boolean;
}

function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || fileName;
}

/** M03 - document half of Document and Folder Management (SRS 3.3). */
export class DocumentService {
  private readonly uploads: UploadService;
  private readonly folders: FolderService;

  constructor(private readonly ctx: AppContext) {
    this.uploads = new UploadService(ctx);
    this.folders = new FolderService(ctx);
  }

  async get(documentId: string): Promise<DocumentDetailDto> {
    const doc = await findDocument(this.ctx.db, documentId);
    if (!doc) throw notFound('Document');
    const { rows: path } = await this.ctx.db.query<{ folder_id: string; name: string }>(
      `WITH RECURSIVE up AS (
         SELECT folder_id, parent_id, name, 1 AS depth FROM folders WHERE folder_id = $1
         UNION ALL
         SELECT f.folder_id, f.parent_id, f.name, up.depth + 1 FROM folders f JOIN up ON f.folder_id = up.parent_id
          WHERE up.depth < 64)
       SELECT folder_id, name FROM up ORDER BY depth DESC`,
      [doc.folderId],
    );
    const { rows: count } = await this.ctx.db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM document_versions WHERE document_id = $1',
      [documentId],
    );
    return { ...doc, folderPath: path.map((p) => ({ folderId: p.folder_id, name: p.name })), versionCount: count[0].n };
  }

  async list(projectId: string, filter: ListFilter = {}): Promise<DocumentDto[]> {
    const params: unknown[] = [projectId];
    let where = 'd.project_id = $1 AND d.deleted_at IS NULL';
    if (filter.folderId !== undefined) {
      if (filter.folderId === null) {
        if (!filter.recursive) where += ' AND d.folder_id IS NULL';
      } else if (filter.recursive) {
        params.push(filter.folderId);
        where += ` AND d.folder_id IN (
          WITH RECURSIVE sub AS (
            SELECT folder_id FROM folders WHERE folder_id = $2
            UNION ALL SELECT f.folder_id FROM folders f JOIN sub ON f.parent_id = sub.folder_id)
          SELECT folder_id FROM sub)`;
      } else {
        params.push(filter.folderId);
        where += ' AND d.folder_id = $2';
      }
    }
    const { rows } = await this.ctx.db.query<DocumentRow>(`${DOCUMENT_SELECT} WHERE ${where} ORDER BY d.updated_at DESC`, params);
    return rows.map(toDocumentDto);
  }

  issueUpload(projectId: string, userId: string, fileName: string, byteSize: number) {
    return this.uploads.issue(projectId, userId, fileName, byteSize);
  }

  /**
   * Doc.Upload.Done: as one transaction, verify the stored file, create the document (Draft), create
   * version 1, point the document at it and log the upload. Doc.Upload.Failure: if any step fails the
   * transaction rolls back and the stored object is removed, so no document refers to a missing file and
   * no file is left without a document.
   */
  async create(
    projectId: string,
    userId: string,
    input: { uploadKey: string; title?: string; description?: string; folderId?: string | null; changeNote?: string },
  ): Promise<DocumentDto> {
    let upload: StoredUpload | undefined;
    try {
      const documentId = await this.ctx.db.tx(async (q) => {
        upload = await this.uploads.consume(q, input.uploadKey, projectId, userId);
        if (input.folderId) await this.folders.assertInProject(q, projectId, input.folderId);
        const title = input.title?.trim() || titleFromFileName(upload.fileName);

        const { rows } = await q.query<{ document_id: string }>(
          `INSERT INTO documents (project_id, folder_id, title, description, created_by)
           VALUES ($1, $2, $3, $4, $5) RETURNING document_id`,
          [projectId, input.folderId ?? null, title, input.description ?? '', userId],
        );
        const id = rows[0].document_id;
        const version = await q.query<{ version_id: string }>(
          `INSERT INTO document_versions
             (document_id, version_no, storage_key, file_name, mime_type, byte_size, checksum, change_note, uploaded_by, extraction_status)
           VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING version_id`,
          [
            id,
            upload.storageKey,
            upload.fileName,
            upload.format.mime,
            upload.byteSize,
            upload.checksum,
            input.changeNote ?? '',
            userId,
            upload.format.extractable ? 'PENDING' : 'UNSUPPORTED',
          ],
        );
        await q.query('UPDATE documents SET current_version_id = $2 WHERE document_id = $1', [id, version.rows[0].version_id]);
        await recordActivity(q, {
          projectId,
          actorId: userId,
          action: 'document.uploaded',
          entityType: 'document',
          entityId: id,
          entityLabel: title,
          detail: { fileName: upload.fileName, byteSize: upload.byteSize, versionNo: 1 },
        });
        return id;
      });
      return (await findDocument(this.ctx.db, documentId))!;
    } catch (error) {
      if (upload) await this.ctx.storage.removeOrphan(upload.storageKey);
      throw error;
    }
  }

  /** Doc.Rename (title and description). */
  async update(documentId: string, userId: string, changes: { title?: string; description?: string }): Promise<DocumentDto> {
    await this.ctx.db.tx(async (q) => {
      const { rows } = await q.query<{ project_id: string; title: string }>(
        `UPDATE documents SET title = COALESCE($2, title), description = COALESCE($3, description), updated_at = now()
          WHERE document_id = $1 RETURNING project_id, title`,
        [documentId, changes.title ?? null, changes.description ?? null],
      );
      await recordActivity(q, {
        projectId: rows[0].project_id,
        actorId: userId,
        action: 'document.updated',
        entityType: 'document',
        entityId: documentId,
        entityLabel: rows[0].title,
        detail: changes,
      });
    });
    return (await findDocument(this.ctx.db, documentId))!;
  }

  /** Doc.Move: to another folder of the same project, or to the project root (null). */
  async move(documentId: string, userId: string, folderId: string | null): Promise<DocumentDto> {
    await this.ctx.db.tx(async (q) => {
      const { rows } = await q.query<{ project_id: string; title: string; folder_id: string | null }>(
        'SELECT project_id, title, folder_id FROM documents WHERE document_id = $1',
        [documentId],
      );
      const doc = rows[0];
      if (folderId) await this.folders.assertInProject(q, doc.project_id, folderId);
      await q.query('UPDATE documents SET folder_id = $2, updated_at = now() WHERE document_id = $1', [documentId, folderId]);
      await recordActivity(q, {
        projectId: doc.project_id,
        actorId: userId,
        action: 'document.moved',
        entityType: 'document',
        entityId: documentId,
        entityLabel: doc.title,
        detail: { from: doc.folder_id, to: folderId },
      });
    });
    return (await findDocument(this.ctx.db, documentId))!;
  }

  /** Doc.Delete: removed from view; versions, files and activity history are kept (SA-2, Log.Retention). */
  async remove(documentId: string, userId: string): Promise<void> {
    await this.ctx.db.tx(async (q) => {
      const { rows } = await q.query<{ project_id: string; title: string }>(
        'UPDATE documents SET deleted_at = now(), deleted_by = $2 WHERE document_id = $1 AND deleted_at IS NULL RETURNING project_id, title',
        [documentId, userId],
      );
      if (!rows[0]) throw notFound('Document');
      await recordActivity(q, { projectId: rows[0].project_id, actorId: userId, action: 'document.deleted', entityType: 'document', entityId: documentId, entityLabel: rows[0].title });
    });
  }

  /** A signed link to one version's file: inline for preview (Doc.Preview) or as an attachment (Doc.Download). */
  async fileLink(versionId: string, disposition: 'inline' | 'attachment'): Promise<FileLinkDto> {
    const { rows } = await this.ctx.db.query<{ storage_key: string; file_name: string; mime_type: string }>(
      'SELECT storage_key, file_name, mime_type FROM document_versions WHERE version_id = $1',
      [versionId],
    );
    const v = rows[0];
    if (!v) throw notFound('Version');
    const previewable = formatForMime(v.mime_type)?.previewable ?? false;
    return {
      url: this.ctx.storage.createDownloadUrl(v.storage_key, { contentType: v.mime_type, fileName: v.file_name, disposition }),
      fileName: v.file_name,
      mimeType: v.mime_type,
      previewable,
      expiresAt: new Date(Date.now() + this.ctx.config.signedUrlTtlSeconds * 1000).toISOString(),
    };
  }

  async currentVersionId(documentId: string): Promise<string> {
    const { rows } = await this.ctx.db.query<{ current_version_id: string }>(
      'SELECT current_version_id FROM documents WHERE document_id = $1',
      [documentId],
    );
    return rows[0].current_version_id;
  }
}
