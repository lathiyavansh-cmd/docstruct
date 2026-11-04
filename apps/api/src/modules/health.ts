/**
 * What this file does
 *   A simple GET /api/health endpoint that shows the server and database are working.
 *
 * Why it exists
 *   Render health-checks the service at /api/health (render.yaml), and the tests use it too. It needs no login
 *   and runs a real query, so a lost database connection shows up as a 500 instead of a false "ok".
 *
 * How it works
 *   - Runs "SELECT 1" to prove the database answers.
 *   - Replies with status 'ok', the app version and which database kind is in use.
 *
 * Where it fits
 *   Registered first in modules/index.ts and checked by test/core.test.ts. Needs no login.
 *   Module: server core (owner: Vansh).
 */
import { Router } from 'express';
import type { HealthDto } from '@docstruct/shared';
import type { AppContext } from '../context.js';

export function healthRoutes(ctx: AppContext): Router {
  const router = Router();
  router.get('/health', async (_req, res) => {
    // If the database is down this throws, and the error handler replies with a 500 instead of 'ok'.
    await ctx.db.query('SELECT 1');
    const body: HealthDto = { status: 'ok', version: process.env.npm_package_version ?? '1.0.2', database: ctx.db.kind };
    res.json(body);
  });
  return router;
}
