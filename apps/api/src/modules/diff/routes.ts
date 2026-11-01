/**
 * What this file does
 *   Defines the two HTTP endpoints for version comparison: compare any two versions of a document, and get
 *   the pre-review (change summary and findings) for a review.
 *
 * How it works
 *   - Both routes run requireAuth and then authorize(ctx, 'diff.read', ...) to check project membership.
 *   - The compare route validates the "from" and "to" query values as UUIDs, then calls DiffService.compare().
 *   - The pre-review route calls DiffService.preReview() with the review id.
 *
 * Where it fits
 *   Registered in modules/index.ts. Logic lives in service.ts. Module: F3.6 Version Comparison & Pre-Review (owner: Vansh).
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { parse, uuid } from '../../lib/validate.js';
import { requireAuth } from '../auth/middleware.js';
import { authorize, byDocument, byReview } from '../rbac/middleware.js';
import { DiffService } from './service.js';
import { requireUnlocked } from '../protection/guard.js';

/** F3.6 - version comparison and pre-review (SRS 3.6). */
export function diffRoutes(ctx: AppContext): Router {
  const router = Router();
  const service = new DiffService(ctx);
  const auth = requireAuth(ctx);

  /** Diff.Compare: any project member may compare any two versions of a document. */
  router.get('/documents/:documentId/compare', auth, authorize(ctx, 'diff.read', byDocument()), requireUnlocked(ctx, 'document'), async (req, res) => {
    const query = parse(z.object({ from: uuid, to: uuid }), req.query);
    res.json(await service.compare(req.params.documentId as string, query.from, query.to));
  });

  /** Diff.PreReview.Run: the change summary and findings for a submitted version. */
  // byReview() finds the project through the review's document, so outsiders get 404.
  router.get('/reviews/:reviewId/pre-review', auth, authorize(ctx, 'diff.read', byReview()), requireUnlocked(ctx, 'review'), async (req, res) => {
    res.json(await service.preReview(req.params.reviewId as string));
  });

  return router;
}
