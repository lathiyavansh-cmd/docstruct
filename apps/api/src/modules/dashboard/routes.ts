/**
 * What this file does
 *   Defines two read-only endpoints for a project: the dashboard summary and the activity log.
 *
 * How it works
 *   - GET /projects/:projectId/dashboard returns everything the dashboard page shows, via DashboardService.
 *   - GET /projects/:projectId/activity returns log entries, with optional paging and document filter.
 *   - Both routes require sign-in and a project role allowed to read (checked by authorize).
 *
 * Where it fits
 *   Registered in modules/index.ts and mounted under /api by app.ts. Uses DashboardService
 *   (service.ts) and ActivityService (activity/service.ts). Module: M09 Activity Logs & Dashboard
 *   (owner: Vivan).
 */
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
    // membershipOf(req) was filled in by authorize(), so the project id here is one the user belongs to.
    res.json(await dashboard.get(membershipOf(req).projectId, currentUser(req).userId));
  });

  router.get('/projects/:projectId/activity', auth, authorize(ctx, 'activity.read', byProject()), async (req, res) => {
    // Query string checks: "before" is the last log id already shown (digits only), "limit" is 1 to 200
    // (coerce turns the text "20" into a number), "documentId" must be a UUID.
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
