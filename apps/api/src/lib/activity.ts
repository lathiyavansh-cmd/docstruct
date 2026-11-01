/**
 * What this file does
 *   Writes entries to the project activity log, the history of who did what and when.
 *
 * How it works
 *   - ActivityAction lists every allowed action name, so a typo fails at compile time.
 *   - ActivityInput describes one log entry (project, actor, action, entity, extra detail).
 *   - recordActivity() inserts one row into the activity_log table.
 *
 * Where it fits
 *   Called by the project, folder, document, version, review, annotation and share services.
 *   The dashboard reads these rows to show recent activity. Module: activity (owner: Vivan).
 */
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
  | 'document.protected'
  | 'document.password_changed'
  | 'document.password_reset'
  | 'document.unprotected'
  | 'document.shared_members'
  | 'version.uploaded'
  | 'version.restored'
  | 'review.submitted'
  | 'review.approved'
  | 'review.changes_requested'
  | 'review.cancelled'
  | 'annotation.created'
  | 'annotation.resolved'
  | 'share.created'
  | 'share.revoked'
  | 'review.nudged'
  | 'template.created'
  | 'template.updated'
  | 'template.deleted'
  | 'document.template_set';

export interface ActivityInput {
  projectId: string;
  actorId: string | null;
  action: ActivityAction;
  entityType: 'project' | 'member' | 'folder' | 'document' | 'version' | 'review' | 'annotation' | 'share' | 'template';
  entityId?: string | null;
  entityLabel?: string | null;
  detail?: Record<string, unknown>;
}

/**
 * Appends one entry to the immutable activity log. Callers pass their transaction so the entry commits
 * or rolls back together with the action it describes (Doc.Upload.Done).
 */
export async function recordActivity(q: Queryable, entry: ActivityInput): Promise<void> {
  // Parameterised query ($1..$7) so values are never pasted into the SQL text.
  // detail is stored as JSON text so each action can carry its own extra fields.
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
