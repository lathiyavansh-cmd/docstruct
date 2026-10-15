/**
 * What this file does
 *   Defines the HTTP endpoints for annotations (comments on a document): list threads on a version,
 *   create a comment, reply to it and mark it resolved.
 *
 * How it works
 *   - Zod schemas check the comment text and the optional page number and region on the page.
 *   - authorize(...) checks the caller's role. byVersion(), byDocument() or byAnnotation() finds the
 *     project from the id in the URL.
 *   - Each handler calls one AnnotationService method.
 *
 * Where it fits
 *   Registered in modules/index.ts and mounted under /api by app.ts. Uses AnnotationService
 *   (service.ts) and the auth and rbac middleware. Module: M07 Sharing & Annotation (owner: Shrut).
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { parse } from '../../lib/validate.js';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { authorize, byAnnotation, byDocument, byVersion } from '../rbac/middleware.js';
import { AnnotationService } from './service.js';

const body = z.string().trim().min(1, 'Write something first').max(4000);
// A region is a box on the page given as fractions (0 to 1) of the page width and height, so it
// works at any zoom level. The small 0.0001 margin allows for rounding errors.
const fraction = z.number().min(0).max(1);
const region = z
  .object({ x: fraction, y: fraction, width: fraction, height: fraction })
  .refine((r) => r.x + r.width <= 1.0001 && r.y + r.height <= 1.0001, 'Region must lie within the page');

/** M07 - annotations (SRS 3.7). */
export function annotationRoutes(ctx: AppContext): Router {
  const router = Router();
  const service = new AnnotationService(ctx);
  const auth = requireAuth(ctx);

  router.get('/versions/:versionId/annotations', auth, authorize(ctx, 'annotation.read', byVersion()), async (req, res) => {
    res.json(await service.list(req.params.versionId as string));
  });

  // New comments are posted on the document, not a version id, so they always land on the current version.
  router.post('/documents/:documentId/annotations', auth, authorize(ctx, 'annotation.create', byDocument()), async (req, res) => {
    const input = parse(z.object({ body, pageNumber: z.number().int().min(1).nullable().optional(), region: region.nullable().optional() }), req.body);
    res.status(201).json(await service.create(req.params.documentId as string, currentUser(req).userId, input));
  });

  router.post('/annotations/:annotationId/replies', auth, authorize(ctx, 'annotation.reply', byAnnotation()), async (req, res) => {
    const input = parse(z.object({ body }), req.body);
    res.status(201).json(await service.reply(req.params.annotationId as string, currentUser(req).userId, input.body));
  });

  router.post('/annotations/:annotationId/resolve', auth, authorize(ctx, 'annotation.resolve', byAnnotation()), async (req, res) => {
    res.json(await service.resolve(req.params.annotationId as string, currentUser(req).userId));
  });

  return router;
}
