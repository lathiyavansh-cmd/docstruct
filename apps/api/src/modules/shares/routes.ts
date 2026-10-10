import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { parse } from '../../lib/validate.js';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { authorize, byDocument, byShare } from '../rbac/middleware.js';
import { ShareService } from './service.js';

/** M07 - share links (SRS 3.7). */
export function shareRoutes(ctx: AppContext): Router {
  const router = Router();
  const service = new ShareService(ctx);
  const auth = requireAuth(ctx);

  router.get('/documents/:documentId/shares', auth, authorize(ctx, 'share.list', byDocument()), async (req, res) => {
    res.json(await service.list(req.params.documentId as string));
  });

  router.post('/documents/:documentId/shares', auth, authorize(ctx, 'share.create', byDocument()), async (req, res) => {
    const input = parse(z.object({ expiresAt: z.string().datetime({ offset: true }).nullable().optional(), label: z.string().trim().max(120).optional() }), req.body);
    res.status(201).json(await service.create(req.params.documentId as string, currentUser(req).userId, input));
  });

  router.post('/shares/:shareId/revoke', auth, authorize(ctx, 'share.revoke', byShare()), async (req, res) => {
    res.json(await service.revoke(req.params.shareId as string, currentUser(req).userId));
  });

  /** Public: no session. Possession of an active link is the only authorisation. */
  router.get('/public/shares/:token', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await service.open(req.params.token as string));
  });

  return router;
}
