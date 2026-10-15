/**
 * What this file does
 *   Holds the logic for annotations: comment threads attached to one document version, with
 *   optional page and region anchors on PDFs, one level of replies, and resolving.
 *
 * How it works
 *   - list() loads all rows for a version, builds the top-level threads, then puts replies under them.
 *   - create() always uses the document's current version and links the comment to the open review
 *     if the author is that review's reviewer.
 *   - reply() copies the parent's version; replies to replies are refused.
 *   - resolve() marks a top-level thread resolved and logs it.
 *
 * Where it fits
 *   Called by annotations/routes.ts. Writes to the annotations table and the activity log. Module:
 *   M07 Sharing & Annotation (owner: Shrut).
 */
import type { AnnotationDto, RegionDto } from '@docstruct/shared';
import type { AppContext } from '../../context.js';
import { recordActivity } from '../../lib/activity.js';
import { HttpError, badRequest, conflict, notFound } from '../../lib/errors.js';

interface AnnotationRow {
  annotation_id: string;
  version_id: string;
  version_no: number;
  parent_id: string | null;
  review_id: string | null;
  author_id: string;
  author_name: string;
  body: string;
  page_number: number | null;
  region: RegionDto | null;
  resolved_at: Date | null;
  resolved_by: string | null;
  resolved_by_name: string | null;
  created_at: Date;
}

const SELECT = `
  SELECT a.annotation_id, a.version_id, v.version_no, a.parent_id, a.review_id, a.author_id, au.display_name AS author_name,
         a.body, a.page_number, a.region, a.resolved_at, a.resolved_by, rb.display_name AS resolved_by_name, a.created_at
    FROM annotations a
    JOIN document_versions v ON v.version_id = a.version_id
    JOIN profiles au ON au.user_id = a.author_id
    LEFT JOIN profiles rb ON rb.user_id = a.resolved_by`;

/** M07 - annotations and discussion threads (SRS 3.7). */
export class AnnotationService {
  constructor(private readonly ctx: AppContext) {}

  /** Annot.List: threads on one version, open ones first, each with its replies in order. */
  async list(versionId: string): Promise<AnnotationDto[]> {
    const { rows } = await this.ctx.db.query<AnnotationRow>(`${SELECT} WHERE a.version_id = $1 ORDER BY a.created_at`, [versionId]);
    // First pass: rows with no parent are thread starters. Second pass: replies are added to their parent.
    const threads = new Map<string, AnnotationDto>();
    for (const r of rows.filter((x) => !x.parent_id)) {
      threads.set(r.annotation_id, {
        annotationId: r.annotation_id,
        versionId: r.version_id,
        versionNo: r.version_no,
        author: { userId: r.author_id, displayName: r.author_name },
        body: r.body,
        pageNumber: r.page_number,
        region: r.region,
        reviewId: r.review_id,
        resolvedAt: r.resolved_at?.toISOString() ?? null,
        resolvedBy: r.resolved_by ? { userId: r.resolved_by, displayName: r.resolved_by_name! } : null,
        createdAt: r.created_at.toISOString(),
        replies: [],
      });
    }
    for (const r of rows.filter((x) => x.parent_id)) {
      threads.get(r.parent_id!)?.replies.push({
        annotationId: r.annotation_id,
        author: { userId: r.author_id, displayName: r.author_name },
        body: r.body,
        createdAt: r.created_at.toISOString(),
      });
    }
    // Open threads (0) sort before resolved ones (1); within each group the created_at order is kept.
    return [...threads.values()].sort((a, b) => Number(!!a.resolvedAt) - Number(!!b.resolvedAt));
  }

  /**
   * Annot.Create, Annot.Create.Anchor, Annot.Version.Scope. The annotation is always attached to the
   * document's current version - the client cannot attach feedback to other content.
   */
  async create(documentId: string, userId: string, input: { body: string; pageNumber?: number | null; region?: RegionDto | null }) {
    const { rows } = await this.ctx.db.query<{ project_id: string; title: string; current_version_id: string; mime_type: string; status: string }>(
      `SELECT d.project_id, d.title, d.current_version_id, v.mime_type, d.status
         FROM documents d JOIN document_versions v ON v.version_id = d.current_version_id
        WHERE d.document_id = $1`,
      [documentId],
    );
    const doc = rows[0];
    if (doc.status === 'ARCHIVED') throw new HttpError(409, 'DOCUMENT_ARCHIVED', 'This document is archived and read-only');
    if ((input.pageNumber || input.region) && doc.mime_type !== 'application/pdf') {
      throw badRequest('Page anchors are only available on PDF documents');
    }
    if (input.region && !input.pageNumber) throw badRequest('A region needs a page number');

    // If the author is the reviewer of an open review, the comment is tagged with that review id.
    const review = await this.ctx.db.query<{ review_id: string }>(
      `SELECT review_id FROM reviews WHERE document_id = $1 AND status = 'PENDING' AND reviewer_id = $2`,
      [documentId, userId],
    );
    const id = await this.ctx.db.tx(async (q) => {
      const inserted = await q.query<{ annotation_id: string }>(
        `INSERT INTO annotations (version_id, review_id, author_id, body, page_number, region)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING annotation_id`,
        [
          doc.current_version_id,
          review.rows[0]?.review_id ?? null,
          userId,
          input.body,
          input.pageNumber ?? null,
          input.region ? JSON.stringify(input.region) : null,
        ],
      );
      await recordActivity(q, {
        projectId: doc.project_id,
        actorId: userId,
        action: 'annotation.created',
        entityType: 'annotation',
        entityId: documentId,
        entityLabel: doc.title,
        detail: { annotationId: inserted.rows[0].annotation_id, page: input.pageNumber ?? null },
      });
      return inserted.rows[0].annotation_id;
    });
    return (await this.list(doc.current_version_id)).find((a) => a.annotationId === id)!;
  }

  /** Annot.Reply, Annot.Reply.Scope: the reply inherits the parent's version. */
  async reply(annotationId: string, userId: string, body: string): Promise<AnnotationDto> {
    const { rows } = await this.ctx.db.query<{ version_id: string; parent_id: string | null }>(
      'SELECT version_id, parent_id FROM annotations WHERE annotation_id = $1',
      [annotationId],
    );
    const parent = rows[0];
    if (!parent) throw notFound('Annotation');
    // Threads are only one level deep: you can reply to a comment but not to a reply.
    if (parent.parent_id) throw badRequest('Reply to the original annotation, not to a reply');
    await this.ctx.db.query('INSERT INTO annotations (version_id, parent_id, author_id, body) VALUES ($1, $2, $3, $4)', [
      parent.version_id,
      annotationId,
      userId,
      body,
    ]);
    return (await this.list(parent.version_id)).find((a) => a.annotationId === annotationId)!;
  }

  /** Annot.Resolve: records who resolved the thread and when. */
  async resolve(annotationId: string, userId: string): Promise<AnnotationDto> {
    const updated = await this.ctx.db.tx(async (q) => {
      // The WHERE clause only matches an unresolved top-level comment, so a repeat resolve or a reply
      // updates no rows and is reported as a conflict below.
      const { rows } = await q.query<{ version_id: string; project_id: string; title: string; document_id: string }>(
        `UPDATE annotations a SET resolved_at = now(), resolved_by = $2
           FROM document_versions v JOIN documents d ON d.document_id = v.document_id
          WHERE a.annotation_id = $1 AND a.parent_id IS NULL AND a.resolved_at IS NULL AND v.version_id = a.version_id
          RETURNING a.version_id, d.project_id, d.title, d.document_id`,
        [annotationId, userId],
      );
      if (!rows[0]) throw conflict('This annotation is already resolved or is a reply', 'ALREADY_RESOLVED');
      await recordActivity(q, {
        projectId: rows[0].project_id,
        actorId: userId,
        action: 'annotation.resolved',
        entityType: 'annotation',
        entityId: rows[0].document_id,
        entityLabel: rows[0].title,
        detail: { annotationId },
      });
      return rows[0];
    });
    return (await this.list(updated.version_id)).find((a) => a.annotationId === annotationId)!;
  }
}
