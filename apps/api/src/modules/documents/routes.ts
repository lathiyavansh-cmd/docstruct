import { Router } from 'express';
import { z } from 'zod';
import { MAX_UPLOAD_BYTES, can } from '@docstruct/shared';
import type { AppContext } from '../../context.js';
import { forbidden } from '../../lib/errors.js';
import { parse, uuid } from '../../lib/validate.js';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { authorize, byDocument, byProject, membershipOf } from '../rbac/middleware.js';
import { DocumentService } from './service.js';

const title = z.string().trim().min(1, 'Title is required').max(200);
const description = z.string().trim().max(2000);

/** M03 - documents (SRS 3.3). */
export function documentRoutes(ctx: AppContext): Router {
  const router = Router();
  const service = new DocumentService(ctx);
  const auth = requireAuth(ctx);

  router.get('/projects/:projectId/documents', auth, authorize(ctx, 'document.read', byProject()), async (req, res) => {
    const query = parse(
      z.object({ folderId: z.union([uuid, z.literal('root')]).optional(), recursive: z.enum(['true', 'false']).optional() }),
      req.query,
    );
    const folderId = query.folderId === undefined ? undefined : query.folderId === 'root' ? null : query.folderId;
    res.json(await service.list(membershipOf(req).projectId, { folderId, recursive: query.recursive === 'true' }));
  });

  /** Upload step 1 for a new document or a new version (Doc.Upload.Format, Doc.Upload.Size). */
  router.post('/projects/:projectId/uploads', auth, authorize(ctx, 'document.read', byProject()), async (req, res) => {
    const membership = membershipOf(req);
    if (!can(membership.role, 'document.create') && !can(membership.role, 'version.create')) throw forbidden();
    if (membership.archived) throw forbidden('This project is archived and is now read-only');
    const body = parse(
      z.object({ fileName: z.string().trim().min(1).max(255), byteSize: z.number().int().positive().max(MAX_UPLOAD_BYTES * 10) }),
      req.body,
    );
    res.status(201).json(await service.issueUpload(membership.projectId, currentUser(req).userId, body.fileName, body.byteSize));
  });

  /** Upload step 2 (Doc.Upload, Doc.Upload.Done). */
  router.post('/projects/:projectId/documents', auth, authorize(ctx, 'document.create', byProject()), async (req, res) => {
    const body = parse(
      z.object({
        uploadKey: z.string().min(1).max(400),
        title: title.optional(),
        description: description.optional(),
        folderId: uuid.nullable().optional(),
        changeNote: z.string().trim().max(500).optional(),
      }),
      req.body,
    );
    res.status(201).json(await service.create(membershipOf(req).projectId, currentUser(req).userId, body));
  });

  router.get('/documents/:documentId', auth, authorize(ctx, 'document.read', byDocument()), async (req, res) => {
    res.json(await service.get(req.params.documentId as string));
  });

  router.patch('/documents/:documentId', auth, authorize(ctx, 'document.update', byDocument()), async (req, res) => {
    const body = parse(z.object({ title: title.optional(), description: description.optional() }), req.body);
    res.json(await service.update(req.params.documentId as string, currentUser(req).userId, body));
  });

  router.post('/documents/:documentId/move', auth, authorize(ctx, 'document.move', byDocument()), async (req, res) => {
    const body = parse(z.object({ folderId: uuid.nullable() }), req.body);
    res.json(await service.move(req.params.documentId as string, currentUser(req).userId, body.folderId));
  });

  router.delete('/documents/:documentId', auth, authorize(ctx, 'document.delete', byDocument()), async (req, res) => {
    await service.remove(req.params.documentId as string, currentUser(req).userId);
    res.status(204).end();
  });

  /** Doc.Preview / Doc.Preview.Unavailable: `previewable` tells the client whether to render or offer download. */
  router.get('/documents/:documentId/preview', auth, authorize(ctx, 'document.read', byDocument()), async (req, res) => {
    const versionId = await service.currentVersionId(req.params.documentId as string);
    res.json(await service.fileLink(versionId, 'inline'));
  });

  /** Doc.Download: the current version. */
  router.get('/documents/:documentId/download', auth, authorize(ctx, 'document.download', byDocument()), async (req, res) => {
    const versionId = await service.currentVersionId(req.params.documentId as string);
    res.json(await service.fileLink(versionId, 'attachment'));
  });

  return router;
}
