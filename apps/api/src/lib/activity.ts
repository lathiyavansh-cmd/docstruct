import type { Queryable } from '../db/database.js';

/** Actions recorded in the activity log (Log.Record). */
export type ActivityAction =
  | 'project.created'
  | 'project.updated'
  | 'project.archived'
  | 'member.added'
  | 'member.role_changed'
  | 'member.removed'
  | 'folder.created'
  | 'folder.renamed'
  | 'folder.moved'
  | 'folder.deleted'
  | 'document.uploaded'
  | 'document.updated'
  | 'document.moved'
  | 'document.deleted'
  | 'document.archived'
  | 'version.uploaded'
  | 'version.restored'
  | 'review.submitted'
  | 'review.approved'
  | 'review.changes_requested'
  | 'review.cancelled'
  | 'annotation.created'
  | 'annotation.resolved'
  | 'share.created'
  | 'share.revoked';

export interface ActivityInput {
  projectId: string;
  actorId: string | null;
  action: ActivityAction;
  entityType: 'project' | 'member' | 'folder' | 'document' | 'version' | 'review' | 'annotation' | 'share';
  entityId?: string | null;
  entityLabel?: string | null;
  detail?: Record<string, unknown>;
}

/**
 * Appends one entry to the immutable activity log. Callers pass their transaction so the entry commits
 * or rolls back together with the action it describes (Doc.Upload.Done).
 */
export async function recordActivity(q: Queryable, entry: ActivityInput): Promise<void> {
  await q.query(
    `INSERT INTO activity_log (project_id, actor_id, action, entity_type, entity_id, entity_label, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.projectId,
      entry.actorId,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      entry.entityLabel ?? null,
      JSON.stringify(entry.detail ?? {}),
    ],
  );
}
