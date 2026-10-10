import { Router } from 'express';
import type { HealthDto } from '@docstruct/shared';
import type { AppContext } from '../context.js';

export function healthRoutes(ctx: AppContext): Router {
  const router = Router();
  router.get('/health', async (_req, res) => {
    await ctx.db.query('SELECT 1');
    const body: HealthDto = { status: 'ok', version: process.env.npm_package_version ?? '1.0.1', database: ctx.db.kind };
    res.json(body);
  });
  return router;
}
