/**
 * What this file does
 *   Defines the one HTTP endpoint that returns the summary of a document version.
 *
 * How it works
 *   - GET /versions/:versionId/summary runs requireAuth, then authorize() with the document.read permission.
 *   - It then calls SummaryService.forVersion() and sends the result as JSON.
 *
 * Where it fits
 *   Registered in modules/index.ts. Logic lives in service.ts. Module: Document summarisation, extends F3.6 (owner: Vansh).
 */
import { Router } from 'express';
import type { AppContext } from '../../context.js';
import { requireAuth } from '../auth/middleware.js';
import { authorize, byVersion } from '../rbac/middleware.js';
import { SummaryService } from './service.js';

/** Document summarisation: every project member who can read a document can read its summary. */
export function summaryRoutes(ctx: AppContext): Router {
  const router = Router();
  const service = new SummaryService(ctx);

  // byVersion() finds the project through the version's document, so only members of that project get through.
  router.get('/versions/:versionId/summary', requireAuth(ctx), authorize(ctx, 'document.read', byVersion()), async (req, res) => {
    res.json(await service.forVersion(req.params.versionId as string));
  });

  return router;
}
