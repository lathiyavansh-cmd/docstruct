/**
 * What this file does
 *   Lists the fixed sets of values the app uses: project roles, document statuses, review statuses,
 *   change kinds and text-extraction statuses, plus the human-readable labels shown on screen.
 *
 * How it works
 *   - Each set is a plain object marked `as const`, so it works both as a value and as a TypeScript type.
 *   - The type line under each object turns its values into a union, e.g. 'OWNER' | 'EDITOR' | ...
 *   - STATUS_LABEL and ROLE_LABEL map each stored value to the text the user sees.
 *
 * Where it fits
 *   Imported by almost every server module and page through @docstruct/shared, and by permissions.ts
 *   and workflow.ts in this package. Module: shared core (owner: Vansh).
 */
// Domain enumerations (SRS Appendix A). Values are stored verbatim in the database.

export const ProjectRole = {
  OWNER: 'OWNER',
  EDITOR: 'EDITOR',
  REVIEWER: 'REVIEWER',
  VIEWER: 'VIEWER',
} as const;
// Same name as the object above: TypeScript keeps values and types apart, so ProjectRole is both.
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

// One label table for both document and review statuses; shared names like APPROVED appear once.
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
