import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { parse, uuid } from '../../lib/validate.js';
import { ActivityService } from '../activity/service.js';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { authorize, byProject, membershipOf } from '../rbac/middleware.js';
import { DashboardService } from './service.js';

/** M09 - Project Dashboard and Activity Log (SRS 3.9). */
export function dashboardRoutes(ctx: AppContext): Router {
  const router = Router();
  const dashboard = new DashboardService(ctx);
  const activity = new ActivityService(ctx);
  const auth = requireAuth(ctx);

  router.get('/projects/:projectId/dashboard', auth, authorize(ctx, 'dashboard.read', byProject()), async (req, res) => {
    res.json(await dashboard.get(membershipOf(req).projectId, currentUser(req).userId));
  });

  router.get('/projects/:projectId/activity', auth, authorize(ctx, 'activity.read', byProject()), async (req, res) => {
    const query = parse(
      z.object({
        before: z.string().regex(/^\d+$/).optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
        documentId: uuid.optional(),
      }),
      req.query,
    );
    res.json(await activity.list(membershipOf(req).projectId, query));
  });

  return router;
}
