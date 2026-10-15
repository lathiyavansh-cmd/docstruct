/**
 * What this file does
 *   Defines the HTTP endpoints for the review workflow: the reviewer's queue, submitting a document
 *   for review, viewing review history, approving, requesting changes, cancelling, and archiving a document.
 *
 * How it works
 *   - Zod schemas check the body (reviewer id, due date as YYYY-MM-DD, optional notes).
 *   - authorize(...) checks the caller's project role. byDocument() or byReview() finds the project
 *     from the id in the URL.
 *   - Each handler calls one ReviewService method and returns its result as JSON.
 *
 * Where it fits
 *   Registered in modules/index.ts and mounted under /api by app.ts. Uses ReviewService (service.ts),
 *   the auth and rbac middleware, and findDocument from the documents module. Module: M05 Review &
 *   Approval (owner: Vivan).
 */
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

  // The queue spans all of the user's projects, so there is no single project to authorize against.
  // The service itself only returns reviews where this user is the reviewer.
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
    // Unlike approve, requesting changes must include a non-empty note explaining what to fix.
    const body = parse(z.object({ note: note.min(1, 'Explain what needs to change') }), req.body);
    res.json(await service.decide(req.params.reviewId as string, currentUser(req).userId, false, body.note));
  });

  // The caller's role is passed on so the service can let an owner cancel someone else's review.
  router.post('/reviews/:reviewId/cancel', auth, authorize(ctx, 'review.submit', byReview()), async (req, res) => {
    res.json(await service.cancel(req.params.reviewId as string, currentUser(req).userId, membershipOf(req).role));
  });

  router.post('/documents/:documentId/archive', auth, authorize(ctx, 'document.archive', byDocument()), async (req, res) => {
    await service.archiveDocument(req.params.documentId as string, currentUser(req).userId);
    res.json(await findDocument(ctx.db, req.params.documentId as string));
  });

  return router;
}
