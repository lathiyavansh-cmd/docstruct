/**
 * What this file does
 *   Defines the HTTP endpoints for documents: list, the two upload steps, view, rename, move, delete,
 *   preview and download.
 *
 * How it works
 *   - Uploads happen in two steps: POST /uploads gives a signed upload URL, then POST /documents
 *     turns the uploaded file into a document.
 *   - authorize(...) checks the caller's project role for each action. byProject() or byDocument()
 *     finds the project from the URL.
 *   - Zod schemas check the body and query string; each handler calls one DocumentService method.
 *
 * Where it fits
 *   Registered in modules/index.ts and mounted under /api by app.ts. Uses DocumentService (service.ts)
 *   and the auth and rbac middleware. Module: M03 Document & Folder Management (owner: Shrut).
 */
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
    // Three cases: no folderId = all documents, "root" = documents not in any folder (null), else one folder.
    const folderId = query.folderId === undefined ? undefined : query.folderId === 'root' ? null : query.folderId;
    res.json(await service.list(membershipOf(req).projectId, { folderId, recursive: query.recursive === 'true' }));
  });

  /** Upload step 1 for a new document or a new version (Doc.Upload.Format, Doc.Upload.Size). */
  router.post('/projects/:projectId/uploads', auth, authorize(ctx, 'document.read', byProject()), async (req, res) => {
    const membership = membershipOf(req);
    // The same upload step serves new documents and new versions, so the role needs either permission.
    // authorize() above only checked read access, so these checks are done by hand here.
    if (!can(membership.role, 'document.create') && !can(membership.role, 'version.create')) throw forbidden();
    if (membership.archived) throw forbidden('This project is archived and is now read-only');
    // The schema lets sizes up to 10x the limit through, so issueUpload() can reply with its clearer
    // "file too large" (413) message instead of a generic validation error.
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
    // 204 No Content: the delete worked and there is nothing to send back.
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
