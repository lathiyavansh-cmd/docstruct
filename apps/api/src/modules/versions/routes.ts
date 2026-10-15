/**
 * What this file does
 *   Defines the HTTP endpoints for document versions: list history, upload a new version, restore an old one,
 *   and get a download or preview link for any version.
 *
 * How it works
 *   - Every route runs requireAuth, then authorize() with the permission it needs (for example version.create).
 *   - The body or URL params are validated with zod, then one VersionService method does the work.
 *   - Download and preview reuse DocumentService.fileLink() to get a link to the stored file.
 *
 * Where it fits
 *   Registered in modules/index.ts. Uses service.ts, the RBAC middleware and the documents module.
 *   Module: M04 Version Control (owner: Vansh).
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { parse, uuid } from '../../lib/validate.js';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { DocumentService } from '../documents/service.js';
import { authorize, byDocument, byVersion } from '../rbac/middleware.js';
import { VersionService } from './service.js';

/** M04 - Version Management (SRS 3.4). */
export function versionRoutes(ctx: AppContext): Router {
  const router = Router();
  const service = new VersionService(ctx);
  const documents = new DocumentService(ctx);
  const auth = requireAuth(ctx);

  router.get('/documents/:documentId/versions', auth, authorize(ctx, 'document.read', byDocument()), async (req, res) => {
    res.json(await service.history(req.params.documentId as string));
  });

  /** Upload step 2 for a new version (step 1 is POST /projects/:projectId/uploads). */
  router.post('/documents/:documentId/versions', auth, authorize(ctx, 'version.create', byDocument()), async (req, res) => {
    // uploadKey points to the file already sent to storage in step 1; the version number is never taken from the client.
    const body = parse(z.object({ uploadKey: z.string().min(1).max(400), changeNote: z.string().trim().max(500).optional() }), req.body);
    res.status(201).json(await service.upload(req.params.documentId as string, currentUser(req).userId, body.uploadKey, body.changeNote ?? ''));
  });

  router.post(
    '/documents/:documentId/versions/:versionId/restore',
    auth,
    authorize(ctx, 'version.restore', byDocument()),
    async (req, res) => {
      // The version id is checked to be a UUID here; the service also checks it belongs to this document.
      const { versionId } = parse(z.object({ versionId: uuid }), req.params);
      res.status(201).json(await service.restore(req.params.documentId as string, versionId, currentUser(req).userId));
    },
  );

  /** Version.Download.Previous */
  router.get('/versions/:versionId/download', auth, authorize(ctx, 'document.download', byVersion()), async (req, res) => {
    res.json(await documents.fileLink(req.params.versionId as string, 'attachment'));
  });

  router.get('/versions/:versionId/preview', auth, authorize(ctx, 'document.read', byVersion()), async (req, res) => {
    res.json(await documents.fileLink(req.params.versionId as string, 'inline'));
  });

  return router;
}
