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
const role = z.enum(PROJECT_ROLES as [string, ...string[]]).transform((r) => r as (typeof PROJECT_ROLES)[number]);

/** M02 - Project and Membership Management (SRS 3.2). */
export function projectRoutes(ctx: AppContext): Router {
  const router = Router();
  const service = new ProjectService(ctx);
  const auth = requireAuth(ctx);
  const project = byProject();

  router.get('/projects', auth, async (req, res) => {
    res.json(await service.list(currentUser(req).userId));
  });

  router.post('/projects', auth, async (req, res) => {
    const body = parse(z.object({ name, description: description.optional() }), req.body);
    res.status(201).json(await service.create(currentUser(req).userId, body.name, body.description ?? ''));
  });

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
