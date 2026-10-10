import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { parse, uuid } from '../../lib/validate.js';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { findDocument } from '../documents/queries.js';
import { authorize, byDocument, byReview, membershipOf } from '../rbac/middleware.js';
import { ReviewService } from './service.js';

const note = z.string().trim().max(2000);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');

/** M05 - Structured Review Workflow (SRS 3.5). */
export function reviewRoutes(ctx: AppContext, service = new ReviewService(ctx)): Router {
  const router = Router();
  const auth = requireAuth(ctx);

  router.get('/reviews/queue', auth, async (req, res) => {
    res.json(await service.queue(currentUser(req).userId));
  });

  router.post('/documents/:documentId/reviews', auth, authorize(ctx, 'review.submit', byDocument()), async (req, res) => {
    const body = parse(z.object({ reviewerId: uuid, dueDate: isoDate.nullable().optional(), note: z.string().trim().max(1000).optional() }), req.body);
    res.status(201).json(await service.submit(req.params.documentId as string, currentUser(req).userId, body));
  });

  router.get('/documents/:documentId/reviews', auth, authorize(ctx, 'document.read', byDocument()), async (req, res) => {
    res.json(await service.history(req.params.documentId as string));
  });

  router.get('/reviews/:reviewId', auth, authorize(ctx, 'document.read', byReview()), async (req, res) => {
    res.json(await service.get(req.params.reviewId as string));
  });

  router.post('/reviews/:reviewId/approve', auth, authorize(ctx, 'review.decide', byReview()), async (req, res) => {
    const body = parse(z.object({ note: note.optional() }), req.body ?? {});
    res.json(await service.decide(req.params.reviewId as string, currentUser(req).userId, true, body.note ?? ''));
  });

  router.post('/reviews/:reviewId/request-changes', auth, authorize(ctx, 'review.decide', byReview()), async (req, res) => {
    const body = parse(z.object({ note: note.min(1, 'Explain what needs to change') }), req.body);
    res.json(await service.decide(req.params.reviewId as string, currentUser(req).userId, false, body.note));
  });

  router.post('/reviews/:reviewId/cancel', auth, authorize(ctx, 'review.submit', byReview()), async (req, res) => {
    res.json(await service.cancel(req.params.reviewId as string, currentUser(req).userId, membershipOf(req).role));
  });

  router.post('/documents/:documentId/archive', auth, authorize(ctx, 'document.archive', byDocument()), async (req, res) => {
    await service.archiveDocument(req.params.documentId as string, currentUser(req).userId);
    res.json(await findDocument(ctx.db, req.params.documentId as string));
  });

  return router;
}
