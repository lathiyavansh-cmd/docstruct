/**
 * What this file does
 *   The HTTP endpoints for sending a document to all project members and for the "Shared with me" list.
 *
 * How it works
 *   - POST /documents/:id/share-members  project owners: send to every member, with an optional note.
 *   - GET  /me/shared                     any logged-in user: documents sent to them, newest first.
 *   - POST /documents/:id/shared/read     any member: mark a received document as opened.
 *
 * Where it fits
 *   Registered in modules/index.ts. Logic lives in service.ts. Module: M07 Sharing (owner: Shrut).
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { parse } from '../../lib/validate.js';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { authorize, byDocument } from '../rbac/middleware.js';
import { RecipientService } from './service.js';

export function recipientRoutes(ctx: AppContext): Router {
  const router = Router();
  const service = new RecipientService(ctx);
  const auth = requireAuth(ctx);

  // Only the project owner (the "manager") may send a document to everyone.
  router.post('/documents/:documentId/share-members', auth, authorize(ctx, 'document.share.members', byDocument()), async (req, res) => {
    const body = parse(z.object({ note: z.string().trim().max(500).optional() }), req.body ?? {});
    res.json(await service.shareWithMembers(req.params.documentId as string, currentUser(req).userId, body.note ?? ''));
  });

  // The caller's own list; no project id is needed because it spans all their projects.
  router.get('/me/shared', auth, async (req, res) => {
    res.json(await service.forUser(currentUser(req).userId));
  });

  router.post('/documents/:documentId/shared/read', auth, authorize(ctx, 'document.read', byDocument()), async (req, res) => {
    await service.markRead(req.params.documentId as string, currentUser(req).userId);
    res.status(204).end();
  });

  return router;
}
