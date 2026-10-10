import { DOCUMENT_STATUSES, type DashboardDto, type DocumentStatus } from '@docstruct/shared';
import type { AppContext } from '../../context.js';
import { ActivityService } from '../activity/service.js';
import { DOCUMENT_SELECT, toDocumentDto, type DocumentRow } from '../documents/queries.js';
import { ProjectService } from '../projects/service.js';
import { ReviewService } from '../reviews/service.js';

/** M09 - Project dashboard (SRS 3.9). Everything a member needs on opening a project, in one request (PE-6). */
export class DashboardService {
  private readonly projects: ProjectService;
  private readonly reviews: ReviewService;
  private readonly activity: ActivityService;

  constructor(private readonly ctx: AppContext) {
    this.projects = new ProjectService(ctx);
    this.reviews = new ReviewService(ctx);
    this.activity = new ActivityService(ctx);
  }

  async get(projectId: string, userId: string): Promise<DashboardDto> {
    const [project, counts, awaiting, changes, underReview, annotations, recent] = await Promise.all([
      this.projects.get(projectId, userId),
      this.ctx.db.query<{ status: DocumentStatus; n: number }>(
        'SELECT status, count(*)::int AS n FROM documents WHERE project_id = $1 AND deleted_at IS NULL GROUP BY status',
        [projectId],
      ),
      this.reviews.queue(userId),
      // "Documents of theirs": ones the user created or last submitted for review.
      this.ctx.db.query<DocumentRow>(
        `${DOCUMENT_SELECT}
          WHERE d.project_id = $1 AND d.deleted_at IS NULL AND d.status = 'CHANGES_REQUESTED'
            AND (d.created_by = $2 OR EXISTS (
                 SELECT 1 FROM reviews r WHERE r.document_id = d.document_id AND r.submitted_by = $2))
          ORDER BY d.updated_at DESC`,
        [projectId, userId],
      ),
      this.ctx.db.query<DocumentRow>(
        `${DOCUMENT_SELECT} WHERE d.project_id = $1 AND d.deleted_at IS NULL AND d.status = 'UNDER_REVIEW'
          ORDER BY cr.due_date NULLS LAST, d.updated_at`,
        [projectId],
      ),
      this.ctx.db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM annotations a
           JOIN documents d ON d.current_version_id = a.version_id
          WHERE d.project_id = $1 AND d.deleted_at IS NULL AND a.parent_id IS NULL AND a.resolved_at IS NULL`,
        [projectId],
      ),
      this.activity.list(projectId, { limit: 10 }),
    ]);

    const statusCounts = Object.fromEntries(DOCUMENT_STATUSES.map((s) => [s, 0])) as Record<DocumentStatus, number>;
    for (const row of counts.rows) statusCounts[row.status] = row.n;
    const today = new Date().toISOString().slice(0, 10);

    return {
      project,
      statusCounts,
      totalDocuments: Object.values(statusCounts).reduce((a, b) => a + b, 0),
      awaitingMyReview: awaiting.filter((r) => r.projectId === projectId),
      myChangesRequested: changes.rows.map(toDocumentDto),
      underReview: underReview.rows.map(toDocumentDto).map((document) => ({
        document,
        reviewer: document.openReview!.reviewer,
        dueDate: document.openReview!.dueDate,
        overdue: !!document.openReview!.dueDate && document.openReview!.dueDate < today,
      })),
      openAnnotations: annotations.rows[0].n,
      recentActivity: recent,
    };
  }
}
