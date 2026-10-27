/**
 * What this file does
 *   Describes the exact shape of every JSON body that travels between the website and the server.
 *   A "DTO" (data transfer object) is one such shape; a "Request" is what the website sends.
 *
 * How it works
 *   - Each interface lists the fields and their types; there is no runtime code except PASSWORD_MIN_LENGTH.
 *   - The server builds its responses to match these types, and the website reads them using the same types.
 *   - If one side changes a field, the other side stops compiling, so the two can never drift apart silently.
 *   - Groups follow the project modules (M01 accounts, M02 projects, M03 documents, M05 reviews, and so on).
 *
 * Where it fits
 *   Imported through @docstruct/shared by the API route handlers (apps/api) and the website's API client
 *   and pages (apps/web). Module: shared core (owner: Vansh).
 */
// Request/response shapes of the DocStruct REST API, shared by server and client (Maintainability-2).
// Timestamps travel as ISO-8601 strings.

import type { ChangeKind, DocumentStatus, ExtractionStatus, ProjectRole, ReviewStatus } from './enums.js';

// ---- Errors, M01 accounts and sessions: error body, profile, sign-up, login and session token.

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
// A project as listed for the caller, its members, and the bodies for creating a project and adding a member.

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
// The folder tree, documents with their versions, the two-step upload, and signed file links.

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
  /** True when the document is locked with a password. Its title and details stay visible; its contents do not. */
  isProtected: boolean;
  /** The template this document is checked against, if one was chosen. */
  templateId: string | null;
}

export interface DocumentDetailDto extends DocumentDto {
  /** Folders from the project root down to the document's folder. */
  folderPath: Array<{ folderId: string; name: string }>;
  versionCount: number;
  /** Whether the caller may see the contents now: true when not protected, or unlocked with the password. */
  unlocked: boolean;
  /** When the caller's unlock ends (protected documents only). */
  unlockedUntil: string | null;
}

/** Demo accounts offered on the login page (demo mode only). */
export interface DemoAccountsDto {
  password: string;
  /** Password of the protected document in the demo data. */
  documentPassword: string;
  accounts: Array<{ email: string; name: string; role: string; tryThis: string }>;
}

/** One document another member sent to the caller ("Shared with me"). */
export interface SharedWithMeDto {
  document: DocumentDto;
  projectName: string;
  sharedBy: UserRefDto;
  note: string;
  sharedAt: string;
  /** Null until the caller opens the document. */
  readAt: string | null;
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
// One review request with its reviewer, due date and decision, plus the submit and decide bodies.

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
  /** True while the review is pending and its due date has passed. */
  overdue: boolean;
  /** Whole days until the due date (negative when overdue), or null without a due date. */
  daysUntilDue: number | null;
  /** When the submitter last reminded the reviewer, and how many times in all. */
  nudgedAt: string | null;
  nudgeCount: number;
  status: ReviewStatus;
  decisionNote: string;
  decidedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

/**
 * One item on the caller's Reminders page. Each kind says why it is there:
 *   review_overdue  a review assigned to me is past its due date
 *   review_due_soon a review assigned to me is due within two days
 *   nudged          the submitter reminded me about a review
 *   sent_overdue    a review I sent is past its due date (I can nudge the reviewer)
 *   decided         a review I sent was decided in the last seven days
 */
export type ReminderKind = 'review_overdue' | 'review_due_soon' | 'nudged' | 'sent_overdue' | 'decided';

export interface ReminderDto {
  kind: ReminderKind;
  review: ReviewDto;
}

export interface RemindersDto {
  /** Items that need the caller's attention (everything except "decided"). */
  attention: number;
  items: ReminderDto[];
}

// ---- Document templates ------------------------------------------------------------------------
// A template is a checklist of section headings a document must contain. The check reads the extracted
// text of the current version, so it works on PDF, Word, Markdown and plain text alike.

export interface TemplateDto {
  templateId: string;
  projectId: string;
  name: string;
  description: string;
  headings: string[];
  createdBy: UserRefDto;
  createdAt: string;
  updatedAt: string;
  /** How many documents in the project use this template. */
  documentCount: number;
}

export interface TemplateCheckItemDto {
  /** The required heading, as written in the template. */
  heading: string;
  found: boolean;
  /** The heading in the document that satisfied it, if any (it may be numbered or worded slightly differently). */
  matchedHeading: string | null;
}

export interface TemplateCheckDto {
  template: { templateId: string; name: string };
  versionNo: number;
  /** PENDING while the version's text is still being extracted; UNAVAILABLE when it could not be read. */
  status: 'DONE' | 'PENDING' | 'UNAVAILABLE';
  items: TemplateCheckItemDto[];
  missing: number;
  complete: boolean;
  /** Headings the document has that the template does not ask for (shown for information only). */
  extraHeadings: string[];
}

/** One row of a template's compliance list: a document using the template and how it scores. */
export interface TemplateComplianceDto {
  document: DocumentDto;
  check: TemplateCheckDto;
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
// The result of comparing two versions: per-paragraph changes, word-level segments, counts, and
// rule-based findings shown to the reviewer before they decide.

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

// ---- Document summarisation ------------------------------------------------------------------
// A summary picked from the document's own sentences at three lengths, with key terms, outline and word counts.

export interface SummarySentenceDto {
  text: string;
  /** Heading of the section the sentence comes from, if any. */
  section: string | null;
  /** Index of the sentence in the document, so the summary keeps reading order. */
  position: number;
}

export interface DocumentSummaryDto {
  /** PENDING while text extraction is still running; UNAVAILABLE when the version has no readable text. */
  status: 'PENDING' | 'READY' | 'UNAVAILABLE';
  reason: string | null;
  documentId: string;
  versionId: string;
  versionNo: number;
  /** Each longer level contains every sentence of the shorter ones. */
  levels: { short: SummarySentenceDto[]; medium: SummarySentenceDto[]; detailed: SummarySentenceDto[] } | null;
  keyTerms: string[];
  /** The most representative sentence of each section, for documents with at least two headings. */
  outline: Array<{ heading: string; sentence: string }>;
  stats: { words: number; sentences: number; sections: number; readingMinutes: number } | null;
  /** Machine-generated, advisory only. */
  machineGenerated: true;
  engine: string;
  generatedAt: string | null;
}

// ---- M07 annotations and share links ---------------------------------------------------------
// Comments pinned to a version (optionally to a PDF region) with replies, and view-only share links.

/** Region of a PDF page as fractions of its width and height (0..1, origin top-left). */
export interface RegionDto {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnnotationDto {
  annotationId: string;
  versionId: string;
  versionNo: number;
  author: UserRefDto;
  body: string;
  pageNumber: number | null;
  region: RegionDto | null;
  /** Set when the annotation was written by the reviewer of an open review. */
  reviewId: string | null;
  resolvedAt: string | null;
  resolvedBy: UserRefDto | null;
  createdAt: string;
  replies: AnnotationReplyDto[];
}

export interface AnnotationReplyDto {
  annotationId: string;
  author: UserRefDto;
  body: string;
  createdAt: string;
}

export interface CreateAnnotationRequest {
  body: string;
  pageNumber?: number | null;
  region?: RegionDto | null;
}

export interface ShareLinkDto {
  shareId: string;
  documentId: string;
  label: string;
  createdBy: UserRefDto;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastAccessedAt: string | null;
  accessCount: number;
  active: boolean;
}

/** Returned once, at creation: the only time the raw token (and so the link) exists. */
export interface CreatedShareLinkDto extends ShareLinkDto {
  url: string;
  token: string;
}

/** What an unregistered link recipient sees (Share.Create.ViewOnly, Share.Scope). */
export interface SharedDocumentDto {
  title: string;
  description: string;
  versionNo: number;
  updatedAt: string;
  /** Password-protected: the file links are given only after the password is sent with the request. */
  isProtected: boolean;
  file: FileLinkDto | null;
  download: FileLinkDto | null;
  expiresAt: string | null;
}

// ---- M08 search and filtering ------------------------------------------------------------------
// Search filters and results, then one activity-log entry (used by the activity feed and the dashboard).

export interface SearchQuery {
  q?: string;
  status?: DocumentStatus;
  folderId?: string;
  reviewerId?: string;
  /** Filter.Date: last updated on or after / on or before (YYYY-MM-DD). */
  updatedFrom?: string;
  updatedTo?: string;
}

export interface SearchResultDto {
  document: DocumentDto;
  projectName: string;
  score: number;
  matchedIn: Array<'title' | 'content'>;
  /** Excerpt of the matching content; matched words are wrapped in [[ and ]]. */
  snippet: string | null;
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

// ---- M09 dashboard ------------------------------------------------------------------------------
// Everything the project dashboard shows in one response, then the server health-check reply.

export interface DashboardDto {
  project: ProjectDto;
  /** Dash.Status.Summary: documents per status. */
  statusCounts: Record<DocumentStatus, number>;
  totalDocuments: number;
  /** Dash.Pending.Self: reviews awaiting the caller's decision in this project. */
  awaitingMyReview: ReviewDto[];
  /** Dash.Pending.Self: the caller's documents that came back with requested changes. */
  myChangesRequested: DocumentDto[];
  /** Dash.Review.Progress: everything under review, with reviewer and due date. */
  underReview: Array<{ document: DocumentDto; reviewer: UserRefDto; dueDate: string | null; overdue: boolean }>;
  openAnnotations: number;
  /** Dash.Recent */
  recentActivity: ActivityEntryDto[];
}

export interface HealthDto {
  status: 'ok';
  version: string;
  database: 'embedded' | 'postgres';
}
