/**
 * What this file does
 *   Holds the shared SQL pieces and row converters for documents and versions, so every module reads
 *   a document the same way.
 *
 * How it works
 *   - VERSION_COLUMNS and VERSION_JOINS select one version with its uploader's name.
 *   - documentSelect() / DOCUMENT_SELECT select a document with its current version and any open review.
 *   - toVersionDto() and toDocumentDto() turn database rows (snake_case) into API objects (camelCase).
 *   - findDocument() loads one non-deleted document by id.
 *
 * Where it fits
 *   Used by documents/service.ts, versions/service.ts, dashboard/service.ts, search/service.ts and
 *   reviews/routes.ts. Module: M03 Document & Folder Management (owner: Shrut).
 */
import type { DocumentDto, DocumentStatus, ExtractionStatus, VersionDto } from '@docstruct/shared';
import type { Queryable } from '../../db/database.js';

/** Column list producing one VersionDto row; expects `v` = document_versions, `d` = documents. */
export const VERSION_COLUMNS = `
  v.version_id, v.document_id, v.version_no, v.file_name, v.mime_type, v.byte_size, v.checksum, v.change_note,
  v.created_at, v.extraction_status, v.uploaded_by, up.display_name AS uploaded_by_name,
  rf.version_no AS restored_from_version_no, (v.version_id = d.current_version_id) AS is_current`;

// LEFT JOIN because only restored versions have restored_from_version_id; normal uploads leave it empty.
export const VERSION_JOINS = `
  JOIN profiles up ON up.user_id = v.uploaded_by
  LEFT JOIN document_versions rf ON rf.version_id = v.restored_from_version_id`;

export interface VersionRow {
  version_id: string;
  document_id: string;
  version_no: number;
  file_name: string;
  mime_type: string;
  byte_size: number;
  checksum: string;
  change_note: string;
  created_at: Date;
  extraction_status: ExtractionStatus;
  uploaded_by: string;
  uploaded_by_name: string;
  restored_from_version_no: number | null;
  is_current: boolean;
}

export function toVersionDto(r: VersionRow): VersionDto {
  return {
    versionId: r.version_id,
    documentId: r.document_id,
    versionNo: r.version_no,
    fileName: r.file_name,
    mimeType: r.mime_type,
    byteSize: r.byte_size,
    checksum: r.checksum,
    changeNote: r.change_note,
    uploadedBy: { userId: r.uploaded_by, displayName: r.uploaded_by_name },
    createdAt: r.created_at.toISOString(),
    restoredFromVersionNo: r.restored_from_version_no,
    extractionStatus: r.extraction_status,
    isCurrent: r.is_current,
  };
}

/**
 * One row per (non-deleted) document with its current version and open review.
 * Callers append WHERE / ORDER BY clauses using the aliases d, v, cr; extra columns may be prepended.
 */
export function documentSelect(extraColumns = ''): string {
  // The reviews join only matches a PENDING review, so cr.* is empty when no review is open.
  // A unique index allows at most one pending review per document, so this never duplicates rows.
  return `
  SELECT ${extraColumns ? `${extraColumns},` : ''} d.document_id, d.project_id, d.folder_id, d.title, d.description, d.status, d.created_by,
         cb.display_name AS created_by_name, d.created_at AS doc_created_at, d.updated_at,
         ${VERSION_COLUMNS},
         cr.review_id, cr.reviewer_id, rp.display_name AS reviewer_name, cr.due_date::text AS due_date
    FROM documents d
    JOIN document_versions v ON v.version_id = d.current_version_id
    ${VERSION_JOINS}
    JOIN profiles cb ON cb.user_id = d.created_by
    LEFT JOIN reviews cr ON cr.document_id = d.document_id AND cr.status = 'PENDING'
    LEFT JOIN profiles rp ON rp.user_id = cr.reviewer_id`;
}

export const DOCUMENT_SELECT = documentSelect();

export interface DocumentRow extends VersionRow {
  project_id: string;
  folder_id: string | null;
  title: string;
  description: string;
  status: DocumentStatus;
  created_by: string;
  created_by_name: string;
  doc_created_at: Date;
  updated_at: Date;
  review_id: string | null;
  reviewer_id: string | null;
  reviewer_name: string | null;
  due_date: Date | string | null;
}

// Accepts the due date as either a Date or a string and keeps only the YYYY-MM-DD part.
function isoDate(value: Date | string | null): string | null {
  if (value === null) return null;
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

export function toDocumentDto(r: DocumentRow): DocumentDto {
  return {
    documentId: r.document_id,
    projectId: r.project_id,
    folderId: r.folder_id,
    title: r.title,
    description: r.description,
    status: r.status,
    createdBy: { userId: r.created_by, displayName: r.created_by_name },
    createdAt: r.doc_created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    currentVersion: toVersionDto(r),
    openReview: r.review_id
      ? { reviewId: r.review_id, reviewer: { userId: r.reviewer_id!, displayName: r.reviewer_name! }, dueDate: isoDate(r.due_date) }
      : null,
  };
}

export async function findDocument(q: Queryable, documentId: string): Promise<DocumentDto | null> {
  // Soft-deleted documents (deleted_at set) are treated as not found.
  const { rows } = await q.query<DocumentRow>(`${DOCUMENT_SELECT} WHERE d.document_id = $1 AND d.deleted_at IS NULL`, [documentId]);
  return rows[0] ? toDocumentDto(rows[0]) : null;
}
