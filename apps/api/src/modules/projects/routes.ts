/**
 * What this file does
 *   Defines the HTTP endpoints for projects and project members: list, create, view, rename,
 *   archive, and add, re-role or remove members.
 *
 * How it works
 *   - Zod schemas (name, description, role) check the request body before any work is done.
 *   - Every route runs requireAuth first, so only signed-in users get through.
 *   - Routes for one project also run authorize(...) with a permission name, which checks the
 *     caller's role in that project.
 *   - Each handler then calls one ProjectService method and sends back its result as JSON.
 *
 * Where it fits
 *   Registered in modules/index.ts and mounted under /api by app.ts. Relies on the auth and rbac middleware and on ProjectService
 *   (service.ts). Module: M02 Project Management (owner: Vivan).
 */
import { Router } from 'express';
import { z } from 'zod';
import { PROJECT_ROLES } from '@docstruct/shared';
import type { AppContext } from '../../context.js';
import { parse, uuid } from '../../lib/validate.js';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { authorize, byProject } from '../rbac/middleware.js';
import { ProjectService } from './service.js';

const name = z.string().trim().min(1, 'Project name is required').max(120);
const description = z.string().trim().max(2000);
// Only the four known roles (OWNER, EDITOR, REVIEWER, VIEWER) are accepted; anything else is a 400.
const role = z.enum(PROJECT_ROLES as [string, ...string[]]).transform((r) => r as (typeof PROJECT_ROLES)[number]);

/** M02 - Project and Membership Management (SRS 3.2). */
export function projectRoutes(ctx: AppContext): Router {
  const router = Router();
  const service = new ProjectService(ctx);
  const auth = requireAuth(ctx);
  const project = byProject();

  // No authorize() here: listing and creating are not tied to one project, any signed-in user may do them.
  router.get('/projects', auth, async (req, res) => {
    res.json(await service.list(currentUser(req).userId));
  });

  router.post('/projects', auth, async (req, res) => {
    const body = parse(z.object({ name, description: description.optional() }), req.body);
    res.status(201).json(await service.create(currentUser(req).userId, body.name, body.description ?? ''));
  });

  // authorize() returns 404 for non-members and 403 if the role lacks the named permission.
  router.get('/projects/:projectId', auth, authorize(ctx, 'project.read', project), async (req, res) => {
    res.json(await service.get(req.params.projectId as string, currentUser(req).userId));
  });

  router.patch('/projects/:projectId', auth, authorize(ctx, 'project.update', project), async (req, res) => {
    const body = parse(z.object({ name: name.optional(), description: description.optional() }), req.body);
    res.json(await service.update(req.params.projectId as string, currentUser(req).userId, body));
  });

  router.post('/projects/:projectId/archive', auth, authorize(ctx, 'project.archive', project), async (req, res) => {
    res.json(await service.archive(req.params.projectId as string, currentUser(req).userId));
  });

  router.get('/projects/:projectId/members', auth, authorize(ctx, 'member.list', project), async (req, res) => {
    res.json(await service.members(req.params.projectId as string, currentUser(req).userId));
  });

  router.post('/projects/:projectId/members', auth, authorize(ctx, 'member.add', project), async (req, res) => {
    const body = parse(z.object({ email: z.string().trim().email('Enter a valid email address'), role }), req.body);
    res.status(201).json(await service.addMember(req.params.projectId as string, currentUser(req).userId, body.email, body.role));
  });

  router.patch('/projects/:projectId/members/:userId', auth, authorize(ctx, 'member.role.change', project), async (req, res) => {
    // The target member id comes from the URL, so it is checked to be a valid UUID first.
    const { userId } = parse(z.object({ userId: uuid }), req.params);
    const body = parse(z.object({ role }), req.body);
    res.json(await service.changeRole(req.params.projectId as string, currentUser(req).userId, userId, body.role));
  });

  router.delete('/projects/:projectId/members/:userId', auth, authorize(ctx, 'member.remove', project), async (req, res) => {
    const { userId } = parse(z.object({ userId: uuid }), req.params);
    res.json(await service.removeMember(req.params.projectId as string, currentUser(req).userId, userId));
  });

  return router;
}
