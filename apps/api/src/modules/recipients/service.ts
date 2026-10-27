/**
 * What this file does
 *   Sends a document to every member of its project at once, and gives each member a "Shared with me" list.
 *
 * How it works
 *   - shareWithMembers() adds one document_recipients row per member (except the sender) with a single
 *     INSERT ... SELECT, so 100 members or 10,000 take one database statement. Sending again refreshes the
 *     note and marks it unread instead of creating duplicates.
 *   - forUser() lists what was sent to the caller, newest first, only for documents that still exist in
 *     projects the caller still belongs to.
 *   - markRead() records that the caller opened the document, which clears it from the unread count.
 *   - Sending does not bypass a password: a protected document still asks each member for it.
 *
 * Where it fits
 *   Used by recipients/routes.ts. The web client shows the list on the Shared with me page and the unread
 *   count in the sidebar. Module: M07 Sharing (owner: Shrut).
 */
import type { SharedWithMeDto } from '@docstruct/shared';
import type { AppContext } from '../../context.js';
import { recordActivity } from '../../lib/activity.js';
import { notFound } from '../../lib/errors.js';
import { documentSelect, toDocumentDto, type DocumentRow } from '../documents/queries.js';

interface InboxRow extends DocumentRow {
  project_name: string;
  shared_by: string;
  shared_by_name: string;
  note: string;
  shared_at: Date;
  read_at: Date | null;
}

export class RecipientService {
  constructor(private readonly ctx: AppContext) {}

  /** Sends the document to every project member except the sender. Returns how many members received it. */
  async shareWithMembers(documentId: string, senderId: string, note: string): Promise<{ recipients: number }> {
    return this.ctx.db.tx(async (q) => {
      const { rows: docs } = await q.query<{ project_id: string; title: string }>(
        'SELECT project_id, title FROM documents WHERE document_id = $1 AND deleted_at IS NULL',
        [documentId],
      );
      const doc = docs[0];
      if (!doc) throw notFound('Document');
      // One statement for all members. ON CONFLICT: a member who already received it gets the new note
      // and sees it as unread again, rather than a second copy.
      const { rows } = await q.query<{ user_id: string }>(
        `INSERT INTO document_recipients (document_id, user_id, shared_by, note)
         SELECT $1, m.user_id, $2, $3 FROM project_members m
          WHERE m.project_id = $4 AND m.user_id <> $2
         ON CONFLICT (document_id, user_id)
         DO UPDATE SET shared_by = EXCLUDED.shared_by, note = EXCLUDED.note, shared_at = now(), read_at = NULL
         RETURNING user_id`,
        [documentId, senderId, note, doc.project_id],
      );
      await recordActivity(q, {
        projectId: doc.project_id,
        actorId: senderId,
        action: 'document.shared_members',
        entityType: 'document',
        entityId: documentId,
        entityLabel: doc.title,
        detail: { recipients: rows.length },
      });
      return { recipients: rows.length };
    });
  }

  /** Everything sent to the user, newest first. Leaving a project or a deleted document hides the entry. */
  async forUser(userId: string): Promise<SharedWithMeDto[]> {
    const { rows } = await this.ctx.db.query<InboxRow>(
      `SELECT * FROM (
         ${documentSelect('p.name AS project_name, r.shared_by, sb.display_name AS shared_by_name, r.note, r.shared_at, r.read_at')}
         JOIN document_recipients r ON r.document_id = d.document_id AND r.user_id = $1
         JOIN projects p ON p.project_id = d.project_id
         JOIN project_members pm ON pm.project_id = d.project_id AND pm.user_id = $1
         JOIN profiles sb ON sb.user_id = r.shared_by
        WHERE d.deleted_at IS NULL
       ) inbox
       ORDER BY shared_at DESC
       LIMIT 200`,
      [userId],
    );
    return rows.map((r) => ({
      document: toDocumentDto(r),
      projectName: r.project_name,
      sharedBy: { userId: r.shared_by, displayName: r.shared_by_name },
      note: r.note,
      sharedAt: r.shared_at.toISOString(),
      readAt: r.read_at?.toISOString() ?? null,
    }));
  }

  /** The user opened the document: it no longer counts as unread. Does nothing if it was never sent to them. */
  async markRead(documentId: string, userId: string): Promise<void> {
    await this.ctx.db.query(
      'UPDATE document_recipients SET read_at = now() WHERE document_id = $1 AND user_id = $2 AND read_at IS NULL',
      [documentId, userId],
    );
  }
}
