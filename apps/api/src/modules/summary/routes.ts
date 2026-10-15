import { Router } from 'express';
import type { AppContext } from '../../context.js';
import { requireAuth } from '../auth/middleware.js';
import { authorize, byVersion } from '../rbac/middleware.js';
import { SummaryService } from './service.js';

/** Document summarisation: every project member who can read a document can read its summary. */
export function summaryRoutes(ctx: AppContext): Router {
  const router = Router();
  const service = new SummaryService(ctx);

  router.get('/versions/:versionId/summary', requireAuth(ctx), authorize(ctx, 'document.read', byVersion()), async (req, res) => {
    res.json(await service.forVersion(req.params.versionId as string));
  });

  return router;
}
