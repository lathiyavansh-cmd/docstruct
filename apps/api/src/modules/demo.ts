/**
 * What this file does
 *   The public endpoint that lists the demo accounts, so the login page can offer them with one click.
 *
 * How it works
 *   - GET /demo-accounts answers only in demo mode (SEED_DEMO=true, or local development). Anywhere else it
 *     answers 404, so a real installation never shows sign-in details.
 *   - It returns the shared demo password, each account's name, email and role, and a hint of what to try.
 *
 * Where it fits
 *   Registered in modules/index.ts. The accounts are created by db/demo-data.ts; the list is shown by
 *   pages/auth/LoginPage.tsx. Module: scripts / server core (owner: Vansh).
 */
import { Router } from 'express';
import type { DemoAccountsDto } from '@docstruct/shared';
import type { AppContext } from '../context.js';
import { DEMO_ACCOUNTS, DEMO_DOCUMENT_PASSWORD, DEMO_PASSWORD } from '../db/demo-data.js';
import { notFound } from '../lib/errors.js';

export function demoRoutes(ctx: AppContext): Router {
  const router = Router();
  router.get('/demo-accounts', (_req, res) => {
    if (!ctx.config.demoMode) throw notFound('Page');
    const body: DemoAccountsDto = { password: DEMO_PASSWORD, documentPassword: DEMO_DOCUMENT_PASSWORD, accounts: DEMO_ACCOUNTS };
    res.json(body);
  });
  return router;
}
