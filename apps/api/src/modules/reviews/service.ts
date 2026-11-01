/**
 * What this file does
 *   Holds the logic for the review workflow. A document version is sent to one reviewer, who then
 *   approves it or requests changes. The submitter or an owner can cancel the review.
 *
 * How it works
 *   - submit() locks the document row, checks the reviewer and the status change, inserts a review
 *     and sets the document to UNDER_REVIEW.
 *   - decide() locks the review and document, checks that the caller is the named reviewer, then sets
 *     APPROVED or CHANGES_REQUESTED.
 *   - cancel() puts the document back to the status it had before the review.
 *   - nudge() lets the submitter (or an owner) remind the reviewer, at most once a day per review.
 *   - reminders() builds one person's Reminders list: overdue and soon-due reviews, nudges received,
 *     reviews they sent that are overdue, and recent decisions on their documents.
 *   - canTransition() from the shared package is the state machine that says which status changes are legal.
 *   - assertNoOpenReview() and assertNotPendingReviewer() are guards used by other modules.
 *
 * Where it fits
 *   Called by reviews/routes.ts. The guards are used by the projects, documents and folders modules. After a
 *   submit it asks DiffService to compare versions in the background. Module: M05 Review & Approval
 *   (owner: Vivan).
 */
import {
  REVIEWER_ROLES,
  can,
  canTransition,
  type DocumentStatus,
  type ProjectRole,
  type ReviewDto,
  type ReviewStatus,
} from '@docstruct/shared';
import type { ReminderDto, RemindersDto } from '@docstruct/shared';
import type { AppContext } from '../../context.js';
import type { Queryable } from '../../db/database.js';
import { recordActivity } from '../../lib/activity.js';
import { HttpError, badRequest, conflict, forbidden, isUniqueViolation, notFound } from '../../lib/errors.js';
import { DiffService } from '../diff/service.js';
import { loadMembership } from '../rbac/middleware.js';

// Shared query for one review with its document, project, version and both people's names.
// "superseded" is true when a newer version has been uploaded since this review was opened.
const REVIEW_SELECT = `
  SELECT r.review_id, d.project_id, p.name AS project_name, r.document_id, d.title AS document_title,
         r.version_id, v.version_no, (d.current_version_id <> r.version_id) AS superseded,
         r.reviewer_id, rv.display_name AS reviewer_name, r.submitted_by, sb.display_name AS submitted_by_name,
         r.submission_note, r.due_date::text AS due_date, r.status, r.decision_note, r.decided_at, r.cancelled_at, r.created_at,
         (r.status = 'PENDING' AND r.due_date < current_date) AS overdue,
         (r.due_date - current_date)::int AS days_until_due, r.nudged_at, r.nudge_count
    FROM reviews r
    JOIN documents d ON d.document_id = r.document_id
    JOIN projects p ON p.project_id = d.project_id
    JOIN document_versions v ON v.version_id = r.version_id
    JOIN profiles rv ON rv.user_id = r.reviewer_id
    JOIN profiles sb ON sb.user_id = r.submitted_by`;

interface ReviewRow {
  review_id: string;
  project_id: string;
  project_name: string;
  document_id: string;
  document_title: string;
  version_id: string;
  version_no: number;
  superseded: boolean;
  reviewer_id: string;
  reviewer_name: string;
  submitted_by: string;
  submitted_by_name: string;
  submission_note: string;
  due_date: string | null;
  overdue: boolean;
  days_until_due: number | null;
  nudged_at: Date | null;
  nudge_count: number;
  status: ReviewStatus;
  decision_note: string;
  decided_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
}

function toReviewDto(r: ReviewRow): ReviewDto {
  return {
    reviewId: r.review_id,
    projectId: r.project_id,
    projectName: r.project_name,
    documentId: r.document_id,
    documentTitle: r.document_title,
    versionId: r.version_id,
    versionNo: r.version_no,
    superseded: r.superseded,
    reviewer: { userId: r.reviewer_id, displayName: r.reviewer_name },
    submittedBy: { userId: r.submitted_by, displayName: r.submitted_by_name },
    submissionNote: r.submission_note,
    dueDate: r.due_date,
    overdue: r.overdue,
    daysUntilDue: r.days_until_due,
    nudgedAt: r.nudged_at?.toISOString() ?? null,
    nudgeCount: r.nudge_count,
    status: r.status,
    decisionNote: r.decision_note,
    decidedAt: r.decided_at?.toISOString() ?? null,
    cancelledAt: r.cancelled_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
  };
}

/** Review.Submit.Single / Doc.Delete.UnderReview: refuses an action while any of the documents is under review. */
export async function assertNoOpenReview(q: Queryable, documentIds: string[], action: string): Promise<void> {
  if (!documentIds.length) return;
  const { rows } = await q.query<{ title: string }>(
    `SELECT d.title FROM reviews r JOIN documents d ON d.document_id = r.document_id
      WHERE r.document_id = ANY($1::uuid[]) AND r.status = 'PENDING' LIMIT 1`,
    [documentIds],
  );
  if (rows[0]) {
    throw new HttpError(409, 'REVIEW_IN_PROGRESS', `"${rows[0].title}" has a review in progress. Complete or cancel it before you ${action}.`);
  }
}

/** DE-4: a member who is the designated reviewer of an open review cannot be removed or lose the reviewer role. */
export async function assertNotPendingReviewer(q: Queryable, projectId: string, userId: string, newRole: ProjectRole | null) {
  if (newRole && REVIEWER_ROLES.includes(newRole)) return;
  const { rows } = await q.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM reviews r JOIN documents d ON d.document_id = r.document_id
      WHERE d.project_id = $1 AND r.reviewer_id = $2 AND r.status = 'PENDING'`,
    [projectId, userId],
  );
  if (rows[0].n > 0) {
    throw new HttpError(
      409,
      'PENDING_REVIEWER',
      `This member is the reviewer of ${rows[0].n} open review(s). Cancel or complete them first.`,
    );
  }
}

/** M05 - Structured Review Workflow (SRS 3.5). */
/** A reviewer can be reminded about the same review at most once in this period. */
const NUDGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export class ReviewService {
  constructor(private readonly ctx: AppContext) {}

  private async find(q: Queryable, reviewId: string): Promise<ReviewDto> {
    const { rows } = await q.query<ReviewRow>(`${REVIEW_SELECT} WHERE r.review_id = $1`, [reviewId]);
    if (!rows[0]) throw notFound('Review');
    return toReviewDto(rows[0]);
  }

  get(reviewId: string) {
    return this.find(this.ctx.db, reviewId);
  }

  /** Review.History.View: every review of the document, including those of superseded versions. */
  async history(documentId: string): Promise<ReviewDto[]> {
    const { rows } = await this.ctx.db.query<ReviewRow>(`${REVIEW_SELECT} WHERE r.document_id = $1 ORDER BY r.created_at DESC`, [documentId]);
    return rows.map(toReviewDto);
  }

  /** Review.Queue.View: versions awaiting this user's decision across all of their projects. */
  async queue(userId: string): Promise<ReviewDto[]> {
    const { rows } = await this.ctx.db.query<ReviewRow>(
      `${REVIEW_SELECT}
        JOIN project_members m ON m.project_id = d.project_id AND m.user_id = r.reviewer_id
       WHERE r.reviewer_id = $1 AND r.status = 'PENDING' AND d.deleted_at IS NULL
       ORDER BY r.due_date NULLS LAST, r.created_at`,
      [userId],
    );
    return rows.map(toReviewDto);
  }

  /**
   * Review.Submit, .Reviewer, Review.Reviewer.Member, .Version, .Single, .Status, .DueDate, Review.Resubmit.
   * The review is attached to the current version; the document moves to Under Review.
   */
  async submit(documentId: string, userId: string, input: { reviewerId: string; dueDate?: string | null; note?: string }): Promise<ReviewDto> {
    try {
      const reviewId = await this.ctx.db.tx(async (q) => {
        // FOR UPDATE locks the document row until the transaction ends, so two people cannot submit
        // the same document at the same moment.
        const { rows } = await q.query<{ project_id: string; title: string; status: DocumentStatus; current_version_id: string }>(
          'SELECT project_id, title, status, current_version_id FROM documents WHERE document_id = $1 AND deleted_at IS NULL FOR UPDATE',
          [documentId],
        );
        const doc = rows[0];
        if (!doc) throw notFound('Document');

        const reviewer = await loadMembership(q, doc.project_id, input.reviewerId);
        if (!reviewer) throw badRequest('The reviewer must be a member of this project');
        if (!REVIEWER_ROLES.includes(reviewer.role)) {
          throw badRequest('The reviewer must hold the Reviewer or Owner role in this project');
        }

        if (doc.status === 'UNDER_REVIEW') throw conflict('A review is already open for this document', 'REVIEW_ALREADY_OPEN');
        // State machine check: the current status must be allowed to move to UNDER_REVIEW.
        if (!canTransition(doc.status, 'UNDER_REVIEW')) {
          throw conflict(
            doc.status === 'APPROVED'
              ? 'This version is already approved. Upload a new version to start another review.'
              : `A document in the ${doc.status.toLowerCase().replace('_', ' ')} state cannot be submitted`,
            'INVALID_TRANSITION',
          );
        }
        if (doc.status === 'CHANGES_REQUESTED') {
          // Review.Resubmit: changes were requested on a version; a revised version must exist.
          const last = await q.query<{ version_id: string }>(
            `SELECT version_id FROM reviews WHERE document_id = $1 AND status = 'CHANGES_REQUESTED' ORDER BY created_at DESC LIMIT 1`,
            [documentId],
          );
          if (last.rows[0]?.version_id === doc.current_version_id) {
            throw conflict('Changes were requested on this version. Upload a revised version before resubmitting.', 'REVISION_REQUIRED');
          }
        }
        if (input.dueDate && input.dueDate < new Date().toISOString().slice(0, 10)) throw badRequest('The due date cannot be in the past');

        const inserted = await q.query<{ review_id: string }>(
          `INSERT INTO reviews (document_id, version_id, reviewer_id, submitted_by, submission_note, due_date, previous_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING review_id`,
          [documentId, doc.current_version_id, input.reviewerId, userId, input.note ?? '', input.dueDate ?? null, doc.status],
        );
        await q.query(`UPDATE documents SET status = 'UNDER_REVIEW', updated_at = now() WHERE document_id = $1`, [documentId]);
        await recordActivity(q, {
          projectId: doc.project_id,
          actorId: userId,
          action: 'review.submitted',
          entityType: 'review',
          entityId: documentId,
          entityLabel: doc.title,
          detail: { reviewId: inserted.rows[0].review_id, reviewerId: input.reviewerId, dueDate: input.dueDate ?? null },
        });
        return inserted.rows[0].review_id;
      });
      // Diff.PreReview.Run: compare with the predecessor in the background; the review never waits for it.
      new DiffService(this.ctx).schedulePreReview(reviewId);
      return this.get(reviewId);
    } catch (error) {
      // A unique index (reviews_one_open_per_document) allows only one PENDING review per document.
      // If two submits race past the checks, the database rejects the second and we report it here.
      if (isUniqueViolation(error)) throw conflict('A review is already open for this document', 'REVIEW_ALREADY_OPEN');
      throw error;
    }
  }

  /**
   * Review.Approve, Review.RequestChanges, Review.Decision.Note, Review.Decision.Time,
   * Review.Decision.Authority (SE-9): only the designated reviewer, and only while the review is open.
   */
  async decide(reviewId: string, userId: string, approved: boolean, note: string): Promise<ReviewDto> {
    await this.ctx.db.tx(async (q) => {
      const { rows } = await q.query<{ document_id: string; reviewer_id: string; status: ReviewStatus; project_id: string; title: string; doc_status: DocumentStatus }>(
        `SELECT r.document_id, r.reviewer_id, r.status, d.project_id, d.title, d.status AS doc_status
           FROM reviews r JOIN documents d ON d.document_id = r.document_id
          WHERE r.review_id = $1 FOR UPDATE OF r, d`,
        [reviewId],
      );
      const review = rows[0];
      if (!review) throw notFound('Review');
      // Holding the review permission is not enough: only the person named on this review may decide it.
      if (review.reviewer_id !== userId) throw forbidden('Only the designated reviewer can decide this review');
      if (review.status !== 'PENDING') throw conflict('This review has already been decided or cancelled', 'REVIEW_CLOSED');
      const membership = await loadMembership(q, review.project_id, userId);
      if (!membership || !can(membership.role, 'review.decide')) throw forbidden('Your role no longer allows reviewing');

      const target: DocumentStatus = approved ? 'APPROVED' : 'CHANGES_REQUESTED';
      if (!canTransition(review.doc_status, target)) throw conflict(`Illegal transition ${review.doc_status} -> ${target}`, 'INVALID_TRANSITION');

      await q.query(`UPDATE reviews SET status = $2, decision_note = $3, decided_at = now() WHERE review_id = $1`, [reviewId, target, note]);
      await q.query('UPDATE documents SET status = $2, updated_at = now() WHERE document_id = $1', [review.document_id, target]);
      await recordActivity(q, {
        projectId: review.project_id,
        actorId: userId,
        action: approved ? 'review.approved' : 'review.changes_requested',
        entityType: 'review',
        entityId: review.document_id,
        entityLabel: review.title,
        detail: { reviewId, note },
      });
    });
    return this.get(reviewId);
  }

  /**
   * Review.Nudge: the submitter or an owner reminds the reviewer. The reviewer sees it on their Reminders
   * page and in the queue. One nudge per review per 24 hours, so nobody can be spammed.
   */
  async nudge(reviewId: string, userId: string, role: ProjectRole): Promise<ReviewDto> {
    await this.ctx.db.tx(async (q) => {
      const { rows } = await q.query<{ document_id: string; submitted_by: string; reviewer_id: string; status: ReviewStatus; nudged_at: Date | null; project_id: string; title: string }>(
        `SELECT r.document_id, r.submitted_by, r.reviewer_id, r.status, r.nudged_at, d.project_id, d.title
           FROM reviews r JOIN documents d ON d.document_id = r.document_id
          WHERE r.review_id = $1 FOR UPDATE OF r`,
        [reviewId],
      );
      const review = rows[0];
      if (!review) throw notFound('Review');
      if (review.submitted_by !== userId && !can(role, 'review.cancel.any')) {
        throw forbidden('Only the person who submitted the review or a project owner can send a reminder');
      }
      if (review.status !== 'PENDING') throw conflict('This review has already been decided or cancelled', 'REVIEW_CLOSED');
      if (review.reviewer_id === userId) throw badRequest('You are the reviewer of this document');
      if (review.nudged_at && Date.now() - review.nudged_at.getTime() < NUDGE_INTERVAL_MS) {
        throw conflict('The reviewer was already reminded today. Try again tomorrow.', 'NUDGED_RECENTLY');
      }
      await q.query('UPDATE reviews SET nudged_at = now(), nudged_by = $2, nudge_count = nudge_count + 1 WHERE review_id = $1', [reviewId, userId]);
      await recordActivity(q, {
        projectId: review.project_id,
        actorId: userId,
        action: 'review.nudged',
        entityType: 'review',
        entityId: review.document_id,
        entityLabel: review.title,
        detail: { reviewId, reviewerId: review.reviewer_id },
      });
    });
    return this.get(reviewId);
  }

  /**
   * Review.Reminders: everything one person should look at, most urgent first. Only reviews in projects
   * the person still belongs to, on documents that still exist. Computed on request, so it is always current.
   */
  async reminders(userId: string): Promise<RemindersDto> {
    const { rows } = await this.ctx.db.query<ReviewRow & { mine: boolean }>(
      `${REVIEW_SELECT}
        JOIN project_members m ON m.project_id = d.project_id AND m.user_id = $1
       WHERE d.deleted_at IS NULL
         AND ((r.reviewer_id = $1 AND r.status = 'PENDING' AND (r.due_date <= current_date + 2 OR r.nudged_at > now() - interval '7 days'))
           OR (r.submitted_by = $1 AND r.reviewer_id <> $1 AND
               ((r.status = 'PENDING' AND r.due_date < current_date) OR (r.decided_at > now() - interval '7 days'))))
       ORDER BY r.due_date NULLS LAST, r.decided_at DESC NULLS LAST, r.created_at`,
      [userId],
    );
    const items: ReminderDto[] = [];
    for (const row of rows) {
      const review = toReviewDto(row);
      const forMe = row.reviewer_id === userId;
      // One review can be on the list for two reasons (for example overdue and nudged); the most urgent wins.
      if (forMe && review.overdue) items.push({ kind: 'review_overdue', review });
      else if (forMe && review.status === 'PENDING' && review.nudgedAt) items.push({ kind: 'nudged', review });
      else if (forMe && review.status === 'PENDING') items.push({ kind: 'review_due_soon', review });
      else if (review.status === 'PENDING') items.push({ kind: 'sent_overdue', review });
      else items.push({ kind: 'decided', review });
    }
    const order: Record<ReminderDto['kind'], number> = { review_overdue: 0, nudged: 1, review_due_soon: 2, sent_overdue: 3, decided: 4 };
    items.sort((a, b) => order[a.kind] - order[b.kind]);
    return { attention: items.filter((i) => i.kind !== 'decided').length, items };
  }

  /** Review.Cancel: by the submitter or a project owner; the document returns to its previous status. */
  async cancel(reviewId: string, userId: string, role: ProjectRole): Promise<ReviewDto> {
    await this.ctx.db.tx(async (q) => {
      const { rows } = await q.query<{ document_id: string; submitted_by: string; status: ReviewStatus; previous_status: DocumentStatus; project_id: string; title: string }>(
        `SELECT r.document_id, r.submitted_by, r.status, r.previous_status, d.project_id, d.title
           FROM reviews r JOIN documents d ON d.document_id = r.document_id
          WHERE r.review_id = $1 FOR UPDATE OF r, d`,
        [reviewId],
      );
      const review = rows[0];
      if (!review) throw notFound('Review');
      if (review.submitted_by !== userId && !can(role, 'review.cancel.any')) {
        throw forbidden('Only the person who submitted the review or a project owner can cancel it');
      }
      if (review.status !== 'PENDING') throw conflict('Only a pending review can be cancelled', 'REVIEW_CLOSED');
      await q.query(`UPDATE reviews SET status = 'CANCELLED', cancelled_at = now(), cancelled_by = $2 WHERE review_id = $1`, [reviewId, userId]);
      // previous_status was saved when the review was submitted, so the document goes back to exactly that state.
      await q.query('UPDATE documents SET status = $2, updated_at = now() WHERE document_id = $1', [review.document_id, review.previous_status]);
      await recordActivity(q, {
        projectId: review.project_id,
        actorId: userId,
        action: 'review.cancelled',
        entityType: 'review',
        entityId: review.document_id,
        entityLabel: review.title,
        detail: { reviewId },
      });
    });
    return this.get(reviewId);
  }

  /** SA-7: an owner archives a document; it stays readable and can no longer be modified. */
  async archiveDocument(documentId: string, userId: string): Promise<void> {
    await this.ctx.db.tx(async (q) => {
      const { rows } = await q.query<{ project_id: string; title: string; status: DocumentStatus }>(
        'SELECT project_id, title, status FROM documents WHERE document_id = $1 AND deleted_at IS NULL FOR UPDATE',
        [documentId],
      );
      const doc = rows[0];
      if (!doc) throw notFound('Document');
      if (!canTransition(doc.status, 'ARCHIVED')) {
        throw conflict(doc.status === 'ARCHIVED' ? 'This document is already archived' : 'Complete or cancel the review before archiving', 'INVALID_TRANSITION');
      }
      await q.query(`UPDATE documents SET status = 'ARCHIVED', updated_at = now() WHERE document_id = $1`, [documentId]);
      await recordActivity(q, { projectId: doc.project_id, actorId: userId, action: 'document.archived', entityType: 'document', entityId: documentId, entityLabel: doc.title });
    });
  }
}
