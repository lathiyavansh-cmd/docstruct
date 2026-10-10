import { MAX_FOLDER_DEPTH, type FolderNodeDto } from '@docstruct/shared';
import type { AppContext } from '../../context.js';
import type { Queryable } from '../../db/database.js';
import { recordActivity } from '../../lib/activity.js';
import { HttpError, badRequest, conflict, isUniqueViolation, notFound } from '../../lib/errors.js';
import { assertNoOpenReview } from '../reviews/service.js';
import { buildFolderTree, depthOf, descendantsOf, subtreeHeight, wouldCreateCycle } from './tree.js';

const DUPLICATE = 'A folder with that name already exists here';

/** M03 - folder half of Document and Folder Management (SRS 3.3). */
export class FolderService {
  constructor(private readonly ctx: AppContext) {}

  /** The project's folders as a parent map, read inside the caller's transaction. */
  async parentMap(q: Queryable, projectId: string): Promise<Map<string, string | null>> {
    const { rows } = await q.query<{ folder_id: string; parent_id: string | null }>(
      'SELECT folder_id, parent_id FROM folders WHERE project_id = $1',
      [projectId],
    );
    return new Map(rows.map((r) => [r.folder_id, r.parent_id]));
  }

  /** Folder.Tree.View */
  async tree(projectId: string): Promise<FolderNodeDto[]> {
    const { rows } = await this.ctx.db.query<{ folder_id: string; parent_id: string | null; name: string; document_count: number }>(
      `SELECT f.folder_id, f.parent_id, f.name,
              (SELECT count(*)::int FROM documents d WHERE d.folder_id = f.folder_id AND d.deleted_at IS NULL) AS document_count
         FROM folders f WHERE f.project_id = $1`,
      [projectId],
    );
    return buildFolderTree(
      rows.map((r) => ({ folderId: r.folder_id, parentId: r.parent_id, name: r.name, documentCount: r.document_count })),
    );
  }

  /** Verifies that a folder exists in the given project (a parent or target chosen by the client). */
  async assertInProject(q: Queryable, projectId: string, folderId: string): Promise<void> {
    const { rows } = await q.query('SELECT 1 FROM folders WHERE folder_id = $1 AND project_id = $2', [folderId, projectId]);
    if (!rows.length) throw notFound('Folder');
  }

  private async lockFolders(q: Queryable, projectId: string) {
    // Moves and creations are serialised per project so two concurrent moves cannot combine into a cycle.
    await q.query('SELECT 1 FROM projects WHERE project_id = $1 FOR UPDATE', [projectId]);
  }

  /** Folder.Create, Folder.Create.Name */
  async create(projectId: string, userId: string, name: string, parentId: string | null): Promise<FolderNodeDto[]> {
    try {
      await this.ctx.db.tx(async (q) => {
        await this.lockFolders(q, projectId);
        if (parentId) {
          await this.assertInProject(q, projectId, parentId);
          if (depthOf(await this.parentMap(q, projectId), parentId) + 1 > MAX_FOLDER_DEPTH) {
            throw badRequest(`Folders can be nested at most ${MAX_FOLDER_DEPTH} levels deep`);
          }
        }
        const { rows } = await q.query<{ folder_id: string }>(
          'INSERT INTO folders (project_id, parent_id, name, created_by) VALUES ($1, $2, $3, $4) RETURNING folder_id',
          [projectId, parentId, name, userId],
        );
        await recordActivity(q, { projectId, actorId: userId, action: 'folder.created', entityType: 'folder', entityId: rows[0].folder_id, entityLabel: name });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict(DUPLICATE, 'DUPLICATE_NAME');
      throw error;
    }
    return this.tree(projectId);
  }

  /** Folder.Rename */
  async rename(projectId: string, folderId: string, userId: string, name: string): Promise<FolderNodeDto[]> {
    try {
      await this.ctx.db.tx(async (q) => {
        const { rows } = await q.query<{ old: string }>(
          `UPDATE folders f SET name = $2, updated_at = now()
             FROM (SELECT name AS old FROM folders WHERE folder_id = $1) prev
            WHERE f.folder_id = $1 RETURNING prev.old`,
          [folderId, name],
        );
        await recordActivity(q, { projectId, actorId: userId, action: 'folder.renamed', entityType: 'folder', entityId: folderId, entityLabel: name, detail: { from: rows[0].old } });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict(DUPLICATE, 'DUPLICATE_NAME');
      throw error;
    }
    return this.tree(projectId);
  }

  /** Folder.Move and Folder.Move.Cycle */
  async move(projectId: string, folderId: string, userId: string, newParentId: string | null): Promise<FolderNodeDto[]> {
    try {
      await this.ctx.db.tx(async (q) => {
        await this.lockFolders(q, projectId);
        if (newParentId) await this.assertInProject(q, projectId, newParentId);
        const parents = await this.parentMap(q, projectId);
        if (wouldCreateCycle(parents, folderId, newParentId)) {
          throw new HttpError(409, 'FOLDER_CYCLE', 'A folder cannot be moved into itself or into one of its own subfolders');
        }
        if (depthOf(parents, newParentId) + subtreeHeight(parents, folderId) > MAX_FOLDER_DEPTH) {
          throw badRequest(`Folders can be nested at most ${MAX_FOLDER_DEPTH} levels deep`);
        }
        const { rows } = await q.query<{ name: string }>(
          'UPDATE folders SET parent_id = $2, updated_at = now() WHERE folder_id = $1 RETURNING name',
          [folderId, newParentId],
        );
        await recordActivity(q, {
          projectId,
          actorId: userId,
          action: 'folder.moved',
          entityType: 'folder',
          entityId: folderId,
          entityLabel: rows[0].name,
          detail: { from: parents.get(folderId) ?? null, to: newParentId },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('The destination already has a folder with that name', 'DUPLICATE_NAME');
      throw error;
    }
    return this.tree(projectId);
  }

  /**
   * Folder.Delete: a non-empty folder needs explicit confirmation (SA-3). Documents inside are soft-deleted
   * - removed from view with their history kept (SA-2) - and the folder rows are removed.
   */
  async remove(projectId: string, folderId: string, userId: string, confirmed: boolean): Promise<FolderNodeDto[]> {
    await this.ctx.db.tx(async (q) => {
      await this.lockFolders(q, projectId);
      const subtree = descendantsOf(await this.parentMap(q, projectId), folderId);
      const { rows: docs } = await q.query<{ document_id: string; title: string }>(
        'SELECT document_id, title FROM documents WHERE folder_id = ANY($1::uuid[]) AND deleted_at IS NULL',
        [subtree],
      );
      await assertNoOpenReview(q, docs.map((d) => d.document_id), 'delete this folder');
      const empty = docs.length === 0 && subtree.length === 1;
      if (!empty && !confirmed) {
        throw new HttpError(409, 'FOLDER_NOT_EMPTY', 'This folder is not empty. Confirm to delete it with its contents.', {
          documents: docs.length,
          subfolders: subtree.length - 1,
        });
      }

      const { rows } = await q.query<{ name: string }>('SELECT name FROM folders WHERE folder_id = $1', [folderId]);
      for (const doc of docs) {
        await q.query('UPDATE documents SET deleted_at = now(), deleted_by = $2, folder_id = NULL WHERE document_id = $1', [doc.document_id, userId]);
        await recordActivity(q, { projectId, actorId: userId, action: 'document.deleted', entityType: 'document', entityId: doc.document_id, entityLabel: doc.title, detail: { viaFolder: folderId } });
      }
      await q.query('DELETE FROM folders WHERE folder_id = $1', [folderId]);
      await recordActivity(q, {
        projectId,
        actorId: userId,
        action: 'folder.deleted',
        entityType: 'folder',
        entityId: folderId,
        entityLabel: rows[0].name,
        detail: { documents: docs.length, subfolders: subtree.length - 1 },
      });
    });
    return this.tree(projectId);
  }
}
