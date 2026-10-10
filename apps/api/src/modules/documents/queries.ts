import type { DocumentDto, DocumentStatus, ExtractionStatus, VersionDto } from '@docstruct/shared';
import type { Queryable } from '../../db/database.js';

/** Column list producing one VersionDto row; expects `v` = document_versions, `d` = documents. */
export const VERSION_COLUMNS = `
  v.version_id, v.document_id, v.version_no, v.file_name, v.mime_type, v.byte_size, v.checksum, v.change_note,
  v.created_at, v.extraction_status, v.uploaded_by, up.display_name AS uploaded_by_name,
  rf.version_no AS restored_from_version_no, (v.version_id = d.current_version_id) AS is_current`;

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
 * Callers append WHERE / ORDER BY clauses using the aliases d, v, cr.
 */
export const DOCUMENT_SELECT = `
  SELECT d.document_id, d.project_id, d.folder_id, d.title, d.description, d.status, d.created_by,
         cb.display_name AS created_by_name, d.created_at, d.updated_at,
         ${VERSION_COLUMNS},
         NULL::uuid AS review_id, NULL::uuid AS reviewer_id, NULL::text AS reviewer_name, NULL::date AS due_date
    FROM documents d
    JOIN document_versions v ON v.version_id = d.current_version_id
    ${VERSION_JOINS}
    JOIN profiles cb ON cb.user_id = d.created_by`;

export interface DocumentRow extends VersionRow {
  project_id: string;
  folder_id: string | null;
  title: string;
  description: string;
  status: DocumentStatus;
  created_by: string;
  created_by_name: string;
  updated_at: Date;
  review_id: string | null;
  reviewer_id: string | null;
  reviewer_name: string | null;
  due_date: Date | string | null;
}

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
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    currentVersion: toVersionDto(r),
    openReview: r.review_id
      ? { reviewId: r.review_id, reviewer: { userId: r.reviewer_id!, displayName: r.reviewer_name! }, dueDate: isoDate(r.due_date) }
      : null,
  };
}

export async function findDocument(q: Queryable, documentId: string): Promise<DocumentDto | null> {
  const { rows } = await q.query<DocumentRow>(`${DOCUMENT_SELECT} WHERE d.document_id = $1 AND d.deleted_at IS NULL`, [documentId]);
  return rows[0] ? toDocumentDto(rows[0]) : null;
}
