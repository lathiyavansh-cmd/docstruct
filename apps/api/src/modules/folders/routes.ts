/**
 * What this file does
 *   Defines the HTTP endpoints for folders: get the folder tree, create, rename, move and delete.
 *
 * How it works
 *   - A Zod schema checks folder names (1 to 120 characters, no / or \).
 *   - authorize(...) checks the caller's project role. byFolder() finds the project from the folder id.
 *   - Each handler calls one FolderService method, which returns the updated tree.
 *
 * Where it fits
 *   Registered in modules/index.ts and mounted under /api by app.ts. Uses FolderService (service.ts)
 *   and the auth and rbac middleware. Module: M03 Document & Folder Management (owner: Shrut).
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { parse, uuid } from '../../lib/validate.js';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { authorize, byFolder, byProject, membershipOf } from '../rbac/middleware.js';
import { FolderService } from './service.js';

const name = z
  .string()
  .trim()
  .min(1, 'Folder name is required')
  .max(120)
  .refine((n) => !/[\\/]/.test(n), 'Folder names cannot contain / or \\');

/** M03 - folders (SRS 3.3). */
export function folderRoutes(ctx: AppContext): Router {
  const router = Router();
  const service = new FolderService(ctx);
  const auth = requireAuth(ctx);

  router.get('/projects/:projectId/folders', auth, authorize(ctx, 'document.read', byProject()), async (req, res) => {
    res.json(await service.tree(membershipOf(req).projectId));
  });

  router.post('/projects/:projectId/folders', auth, authorize(ctx, 'folder.create', byProject()), async (req, res) => {
    const body = parse(z.object({ name, parentId: uuid.nullable().optional() }), req.body);
    res.status(201).json(await service.create(membershipOf(req).projectId, currentUser(req).userId, body.name, body.parentId ?? null));
  });

  router.patch('/folders/:folderId', auth, authorize(ctx, 'folder.update', byFolder()), async (req, res) => {
    const body = parse(z.object({ name }), req.body);
    res.json(await service.rename(membershipOf(req).projectId, req.params.folderId as string, currentUser(req).userId, body.name));
  });

  router.post('/folders/:folderId/move', auth, authorize(ctx, 'folder.update', byFolder()), async (req, res) => {
    // parentId null means "move to the project root".
    const body = parse(z.object({ parentId: uuid.nullable() }), req.body);
    res.json(await service.move(membershipOf(req).projectId, req.params.folderId as string, currentUser(req).userId, body.parentId));
  });

  router.delete('/folders/:folderId', auth, authorize(ctx, 'folder.delete', byFolder()), async (req, res) => {
    // ?confirm=true is required to delete a folder that still has documents or subfolders.
    const { confirm } = parse(z.object({ confirm: z.enum(['true', 'false']).optional() }), req.query);
    res.json(await service.remove(membershipOf(req).projectId, req.params.folderId as string, currentUser(req).userId, confirm === 'true'));
  });

  return router;
}
