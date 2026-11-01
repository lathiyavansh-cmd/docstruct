/**
 * What this file does
 *   The HTTP endpoints for document templates: managing a project's checklists, choosing one for a
 *   document, and reading the check results.
 *
 * How it works
 *   - GET    /projects/:id/templates                    any member: the project's templates
 *   - POST   /projects/:id/templates                    owner: create one (name, description, headings)
 *   - PATCH  /projects/:id/templates/:tid               owner: change it
 *   - DELETE /projects/:id/templates/:tid               owner: remove it (documents keep their files, lose the check)
 *   - GET    /projects/:id/templates/:tid/compliance    any member: every document using it, incomplete first
 *   - PUT    /documents/:id/template                    editor: choose the template ({ templateId } or null)
 *   - GET    /documents/:id/template-check              any member: the current version's check, or null
 *
 * Where it fits
 *   Registered in modules/index.ts. Logic lives in service.ts and check.ts. Module: templates (owner: Vansh).
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { parse, uuid } from '../../lib/validate.js';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { authorize, byDocument, byProject } from '../rbac/middleware.js';
import { TemplateService } from './service.js';

const name = z.string().trim().min(1, 'Give the template a name').max(120);
const description = z.string().trim().max(1000);
const headings = z.array(z.string().trim().max(120)).min(1, 'Add at least one heading').max(60);

export function templateRoutes(ctx: AppContext): Router {
  const router = Router();
  const service = new TemplateService(ctx);
  const auth = requireAuth(ctx);
  const project = byProject();

  router.get('/projects/:projectId/templates', auth, authorize(ctx, 'project.read', project), async (req, res) => {
    res.json(await service.list(req.params.projectId as string));
  });

  router.post('/projects/:projectId/templates', auth, authorize(ctx, 'template.manage', project), async (req, res) => {
    const body = parse(z.object({ name, description: description.optional(), headings }), req.body);
    res.status(201).json(await service.create(req.params.projectId as string, currentUser(req).userId, body));
  });

  router.patch('/projects/:projectId/templates/:templateId', auth, authorize(ctx, 'template.manage', project), async (req, res) => {
    const { templateId } = parse(z.object({ templateId: uuid }), req.params);
    const body = parse(z.object({ name: name.optional(), description: description.optional(), headings: headings.optional() }), req.body);
    res.json(await service.update(req.params.projectId as string, templateId, currentUser(req).userId, body));
  });

  router.delete('/projects/:projectId/templates/:templateId', auth, authorize(ctx, 'template.manage', project), async (req, res) => {
    const { templateId } = parse(z.object({ templateId: uuid }), req.params);
    await service.remove(req.params.projectId as string, templateId, currentUser(req).userId);
    res.status(204).end();
  });

  router.get('/projects/:projectId/templates/:templateId/compliance', auth, authorize(ctx, 'project.read', project), async (req, res) => {
    const { templateId } = parse(z.object({ templateId: uuid }), req.params);
    res.json(await service.compliance(req.params.projectId as string, templateId));
  });

  router.put('/documents/:documentId/template', auth, authorize(ctx, 'document.update', byDocument()), async (req, res) => {
    const body = parse(z.object({ templateId: uuid.nullable() }), req.body);
    res.json(await service.setDocumentTemplate(req.params.documentId as string, currentUser(req).userId, body.templateId));
  });

  router.get('/documents/:documentId/template-check', auth, authorize(ctx, 'document.read', byDocument()), async (req, res) => {
    res.json(await service.check(req.params.documentId as string));
  });

  return router;
}
