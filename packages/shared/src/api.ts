// Request/response shapes of the DocStruct REST API, shared by server and client (Maintainability-2).
// Timestamps travel as ISO-8601 strings.

import type { ChangeKind, DocumentStatus, ExtractionStatus, ProjectRole, ReviewStatus } from './enums.js';

/** Every error response has this body (Usability-4: state the reason). */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ProfileDto {
  userId: string;
  email: string;
  displayName: string;
  createdAt: string;
}

/** Returned by sign-up and login. The token is sent back as `Authorization: Bearer <token>`. */
export interface SessionDto {
  token: string;
  /** Absolute expiry; the session also ends after the configured idle period. */
  expiresAt: string;
  idleMinutes: number;
  user: ProfileDto;
}

export interface SignUpRequest {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export const PASSWORD_MIN_LENGTH = 8;

/** Another user as seen alongside their activity (Account.Profile.Scope: display name only). */
export interface UserRefDto {
  userId: string;
  displayName: string;
}

// ---- M02 projects and membership -------------------------------------------------------------

export interface ProjectDto {
  projectId: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  /** The caller's role in this project (UI-11). */
  myRole: ProjectRole;
  memberCount: number;
}

export interface MemberDto {
  userId: string;
  displayName: string;
  role: ProjectRole;
  addedAt: string;
  isYou: boolean;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
}

export interface AddMemberRequest {
  email: string;
  role: ProjectRole;
}

// ---- M03 folders and documents ---------------------------------------------------------------

export interface FolderNodeDto {
  folderId: string;
  parentId: string | null;
  name: string;
  /** Documents directly inside this folder. */
  documentCount: number;
  children: FolderNodeDto[];
}

export interface VersionDto {
  versionId: string;
  documentId: string;
  versionNo: number;
  fileName: string;
  mimeType: string;
  byteSize: number;
  checksum: string;
  changeNote: string;
  uploadedBy: UserRefDto;
  createdAt: string;
  restoredFromVersionNo: number | null;
  extractionStatus: ExtractionStatus;
  isCurrent: boolean;
}

export interface DocumentDto {
  documentId: string;
  projectId: string;
  folderId: string | null;
  title: string;
  description: string;
  status: DocumentStatus;
  createdBy: UserRefDto;
  createdAt: string;
  updatedAt: string;
  currentVersion: VersionDto;
  /** Reviewer and due date of the open review, if one is pending. */
  openReview: { reviewId: string; reviewer: UserRefDto; dueDate: string | null } | null;
}

export interface DocumentDetailDto extends DocumentDto {
  /** Folders from the project root down to the document's folder. */
  folderPath: Array<{ folderId: string; name: string }>;
  versionCount: number;
}

/** Step 1 of an upload: the browser PUTs the file to `uploadUrl`, then finalises with `uploadKey`. */
export interface UploadTicketDto {
  uploadKey: string;
  uploadUrl: string;
  method: 'PUT';
  maxBytes: number;
  expiresAt: string;
}

export interface UploadTicketRequest {
  fileName: string;
  byteSize: number;
}

export interface CreateDocumentRequest {
  uploadKey: string;
  title?: string;
  description?: string;
  folderId?: string | null;
  changeNote?: string;
}

/** A short-lived signed URL for a file (SE-13). */
export interface FileLinkDto {
  url: string;
  fileName: string;
  mimeType: string;
  previewable: boolean;
  expiresAt: string;
}

// ---- M05 reviews -------------------------------------------------------------------------------

export interface ReviewDto {
  reviewId: string;
  projectId: string;
  projectName: string;
  documentId: string;
  documentTitle: string;
  versionId: string;
  versionNo: number;
  /** The document's current version is newer than the reviewed one. */
  superseded: boolean;
  reviewer: UserRefDto;
  submittedBy: UserRefDto;
  submissionNote: string;
  dueDate: string | null;
  status: ReviewStatus;
  decisionNote: string;
  decidedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

export interface SubmitReviewRequest {
  reviewerId: string;
  dueDate?: string | null;
  note?: string;
}

export interface DecisionRequest {
  note?: string;
}

// ---- F3.6 version comparison and pre-review -----------------------------------------------------

export interface WordSegmentDto {
  op: 'equal' | 'insert' | 'delete';
  text: string;
}

export interface ChangeDto {
  kind: ChangeKind;
  position: number;
  oldText: string;
  newText: string;
  similarity: number;
  isSubstantive: boolean;
  section: string | null;
  words?: WordSegmentDto[];
}

/** One advisory observation of the pre-review engine (Diff.PreReview.Findings). */
export interface PreReviewFinding {
  id: string;
  severity: 'high' | 'medium' | 'info';
  rule: string;
  title: string;
  message: string;
  section: string | null;
  position: number;
  kind: ChangeKind;
  excerpt: string;
}

export interface DiffStatsDto {
  total: number;
  added: number;
  deleted: number;
  modified: number;
  substantive: number;
  cosmetic: number;
  paragraphsBefore: number;
  paragraphsAfter: number;
}

export interface DiffDto {
  /** PENDING while text extraction is still running; UNAVAILABLE when no textual comparison is possible. */
  status: 'PENDING' | 'READY' | 'UNAVAILABLE';
  reason: string | null;
  documentId: string;
  from: { versionId: string; versionNo: number };
  to: { versionId: string; versionNo: number };
  stats: DiffStatsDto | null;
  changes: ChangeDto[];
  /** Machine-generated, advisory only (Diff.PreReview.Advisory, Diff.PreReview.Attribution). */
  summary: string | null;
  findings: PreReviewFinding[];
  machineGenerated: true;
  engine: string;
  generatedAt: string | null;
}

export interface PreReviewDto {
  reviewId: string;
  /** Diff.FirstVersion: the submitted version is version 1, so there is nothing to compare against. */
  firstVersion: boolean;
  diff: DiffDto | null;
}

export interface ActivityEntryDto {
  logId: string;
  projectId: string;
  actor: UserRefDto | null;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface HealthDto {
  status: 'ok';
  version: string;
  database: 'embedded' | 'postgres';
}
