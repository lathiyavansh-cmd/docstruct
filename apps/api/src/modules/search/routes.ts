import { Router } from 'express';
import { z } from 'zod';
import { DOCUMENT_STATUSES } from '@docstruct/shared';
import type { AppContext } from '../../context.js';
import { parse, uuid } from '../../lib/validate.js';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { authorize, byProject, membershipOf } from '../rbac/middleware.js';
import { SearchService } from './service.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');
const searchQuery = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(DOCUMENT_STATUSES as [string, ...string[]]).optional(),
  folderId: uuid.optional(),
  reviewerId: uuid.optional(),
  updatedFrom: isoDate.optional(),
  updatedTo: isoDate.optional(),
});

/** M08 - Search and Filtering (SRS 3.8). */
export function searchRoutes(ctx: AppContext): Router {
  const router = Router();
  const service = new SearchService(ctx);
  const auth = requireAuth(ctx);

  /** Search and filter within one project (UI-9). */
  router.get('/projects/:projectId/search', auth, authorize(ctx, 'document.search', byProject()), async (req, res) => {
    const query = parse(searchQuery, req.query) as Parameters<SearchService['search']>[1];
    res.json(await service.search([membershipOf(req).projectId], query));
  });

  /** Search across every project the user belongs to - and only those (Search.Scope). */
  router.get('/search', auth, async (req, res) => {
    const query = parse(searchQuery.extend({ q: z.string().trim().min(1, 'Enter a search term').max(200) }), req.query);
    const projects = await service.memberProjects(currentUser(req).userId);
    res.json(projects.length ? await service.search(projects, query as Parameters<SearchService['search']>[1]) : []);
  });

  return router;
}
