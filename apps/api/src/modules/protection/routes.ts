/**
 * What this file does
 *   The HTTP endpoints for password-protected documents.
 *
 * How it works
 *   - POST /documents/:id/unlock           any member, with the password: opens the document for 12 hours.
 *   - POST /documents/:id/protection        editors and owners: lock with a new password.
 *   - POST /documents/:id/protection/change editors and owners: needs the current password.
 *   - POST /documents/:id/protection/remove editors and owners: needs the current password.
 *   - POST /documents/:id/protection/reset  owners only: set a new password when the old one is forgotten.
 *   Each checks login (requireAuth) and the role permission (authorize) before ProtectionService runs.
 *
 * Where it fits
 *   Registered in modules/index.ts. Logic lives in service.ts. Module: M06 Security, document protection (owner: Vansh).
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { parse } from '../../lib/validate.js';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { authorize, byDocument } from '../rbac/middleware.js';
import { ProtectionService } from './service.js';

const password = z.string().min(1).max(200);

export function protectionRoutes(ctx: AppContext): Router {
  const router = Router();
  const service = new ProtectionService(ctx);
  const auth = requireAuth(ctx);
  const id = (params: Record<string, unknown>) => params.documentId as string;

  // Reading permission is enough to unlock: the password itself is the extra check.
  router.post('/documents/:documentId/unlock', auth, authorize(ctx, 'document.read', byDocument()), async (req, res) => {
    const body = parse(z.object({ password }), req.body);
    const until = await service.unlock(id(req.params), currentUser(req), body.password);
    res.json({ unlockedUntil: until.toISOString() });
  });

  router.post('/documents/:documentId/protection', auth, authorize(ctx, 'document.protect', byDocument()), async (req, res) => {
    const body = parse(z.object({ password }), req.body);
    await service.protect(id(req.params), currentUser(req), body.password);
    res.status(204).end();
  });

  router.post('/documents/:documentId/protection/change', auth, authorize(ctx, 'document.protect', byDocument()), async (req, res) => {
    const body = parse(z.object({ currentPassword: password, newPassword: password }), req.body);
    await service.change(id(req.params), currentUser(req), body.currentPassword, body.newPassword);
    res.status(204).end();
  });

  router.post('/documents/:documentId/protection/remove', auth, authorize(ctx, 'document.protect', byDocument()), async (req, res) => {
    const body = parse(z.object({ currentPassword: password }), req.body);
    await service.remove(id(req.params), currentUser(req), body.currentPassword);
    res.status(204).end();
  });

  router.post('/documents/:documentId/protection/reset', auth, authorize(ctx, 'document.protect.reset', byDocument()), async (req, res) => {
    const body = parse(z.object({ newPassword: password }), req.body);
    await service.reset(id(req.params), currentUser(req), body.newPassword);
    res.status(204).end();
  });

  return router;
}
