import type { ActivityEntryDto } from '@docstruct/shared';
import type { AppContext } from '../../context.js';

interface ActivityRow {
  log_id: string;
  project_id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  detail: Record<string, unknown>;
  created_at: Date;
}

export function toActivityDto(r: ActivityRow): ActivityEntryDto {
  return {
    logId: r.log_id,
    projectId: r.project_id,
    actor: r.actor_id ? { userId: r.actor_id, displayName: r.actor_name ?? 'Former member' } : null,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    entityLabel: r.entity_label,
    detail: r.detail ?? {},
    createdAt: r.created_at.toISOString(),
  };
}

/** M09 - Activity log (SRS 3.9). */
export class ActivityService {
  constructor(private readonly ctx: AppContext) {}

  /**
   * Log.View: entries of one project, newest first, optionally for one document. Paginated with a keyset
   * cursor (`before` = the last log id already shown) so deep pages stay fast (PE-10). Entries of deleted
   * documents remain visible (Log.Retention).
   */
  async list(projectId: string, opts: { before?: string; limit?: number; documentId?: string } = {}): Promise<ActivityEntryDto[]> {
    const { rows } = await this.ctx.db.query<ActivityRow>(
      `SELECT a.log_id::text AS log_id, a.project_id, a.actor_id, p.display_name AS actor_name, a.action, a.entity_type,
              a.entity_id, a.entity_label, a.detail, a.created_at
         FROM activity_log a LEFT JOIN profiles p ON p.user_id = a.actor_id
        WHERE a.project_id = $1
          AND ($2::bigint IS NULL OR a.log_id < $2::bigint)
          AND ($3::uuid IS NULL OR a.entity_id = $3::uuid)
        ORDER BY a.log_id DESC
        LIMIT $4`,
      [projectId, opts.before ?? null, opts.documentId ?? null, Math.min(opts.limit ?? 50, 200)],
    );
    return rows.map(toActivityDto);
  }
}
