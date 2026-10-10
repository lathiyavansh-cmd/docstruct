// Domain enumerations (SRS Appendix A). Values are stored verbatim in the database.

export const ProjectRole = {
  OWNER: 'OWNER',
  EDITOR: 'EDITOR',
  REVIEWER: 'REVIEWER',
  VIEWER: 'VIEWER',
} as const;
export type ProjectRole = (typeof ProjectRole)[keyof typeof ProjectRole];
export const PROJECT_ROLES: ProjectRole[] = ['OWNER', 'EDITOR', 'REVIEWER', 'VIEWER'];

export const DocumentStatus = {
  DRAFT: 'DRAFT',
  UNDER_REVIEW: 'UNDER_REVIEW',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  APPROVED: 'APPROVED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];
export const DOCUMENT_STATUSES: DocumentStatus[] = ['DRAFT', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'ARCHIVED'];

export const ReviewStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  CANCELLED: 'CANCELLED',
} as const;
export type ReviewStatus = (typeof ReviewStatus)[keyof typeof ReviewStatus];

export const ChangeKind = {
  ADDED: 'ADDED',
  DELETED: 'DELETED',
  MODIFIED: 'MODIFIED',
} as const;
export type ChangeKind = (typeof ChangeKind)[keyof typeof ChangeKind];

/** State of machine-readable text extraction for one version (Version.Text.Extract / .Failure). */
export const ExtractionStatus = {
  PENDING: 'PENDING',
  DONE: 'DONE',
  FAILED: 'FAILED',
  UNSUPPORTED: 'UNSUPPORTED',
} as const;
export type ExtractionStatus = (typeof ExtractionStatus)[keyof typeof ExtractionStatus];

export const STATUS_LABEL: Record<DocumentStatus | ReviewStatus, string> = {
  DRAFT: 'Draft',
  UNDER_REVIEW: 'Under Review',
  CHANGES_REQUESTED: 'Changes Requested',
  APPROVED: 'Approved',
  ARCHIVED: 'Archived',
  PENDING: 'Pending',
  CANCELLED: 'Cancelled',
};

export const ROLE_LABEL: Record<ProjectRole, string> = {
  OWNER: 'Owner',
  EDITOR: 'Editor',
  REVIEWER: 'Reviewer',
  VIEWER: 'Viewer',
};
