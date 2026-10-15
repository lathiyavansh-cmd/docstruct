/**
 * What this file does
 *   Defines the HTTP endpoints for accounts: sign up, log in, log out, view and edit profile, change and reset password.
 *
 * How it works
 *   - Each request body is checked with a zod schema through parse(); bad input becomes a 400 error.
 *   - The route then calls one AuthService method and sends back its result with the right status code.
 *   - Endpoints that need a logged-in user add the requireAuth middleware ("auth").
 *
 * Where it fits
 *   Registered in modules/index.ts and mounted under /api by app.ts. Business logic lives in service.ts.
 *   Module: M01 Authentication (owner: Vansh).
 */
import { Router } from 'express';
import { z } from 'zod';
import { PASSWORD_MIN_LENGTH } from '@docstruct/shared';
import type { AppContext } from '../../context.js';
import { parse } from '../../lib/validate.js';
import { currentUser, requireAuth } from './middleware.js';
import { AuthService } from './service.js';

// Shared input rules. E-mails are trimmed and lower-cased so "A@x.com" and "a@x.com" are the same account.
const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(128, 'Password must be at most 128 characters');
const displayName = z.string().trim().min(1, 'Display name is required').max(80);

/** M01 - User Account and Authentication (SRS 3.1). */
export function authRoutes(ctx: AppContext): Router {
  const router = Router();
  const service = new AuthService(ctx);
  const auth = requireAuth(ctx);

  router.post('/auth/signup', async (req, res) => {
    const body = parse(z.object({ email, password, displayName }), req.body);
    res.status(201).json(await service.signUp(body.email, body.password, body.displayName));
  });

  router.post('/auth/login', async (req, res) => {
    // Login does not enforce the minimum length, it only needs a non-empty password to check.
    const body = parse(z.object({ email, password: z.string().min(1).max(128) }), req.body);
    res.json(await service.login(body.email, body.password));
  });

  router.post('/auth/logout', auth, async (req, res) => {
    await service.logout(currentUser(req).sessionId);
    res.status(204).end();
  });

  router.get('/auth/me', auth, async (req, res) => {
    res.json(await service.profile(currentUser(req).userId));
  });

  router.patch('/auth/me', auth, async (req, res) => {
    const body = parse(z.object({ displayName }), req.body);
    res.json(await service.updateProfile(currentUser(req).userId, body.displayName));
  });

  router.post('/auth/password/change', auth, async (req, res) => {
    const body = parse(z.object({ currentPassword: z.string().min(1), newPassword: password }), req.body);
    await service.changePassword(currentUser(req), body.currentPassword, body.newPassword);
    res.status(204).end();
  });

  router.post('/auth/password/forgot', async (req, res) => {
    const body = parse(z.object({ email }), req.body);
    await service.requestPasswordReset(body.email);
    // Same reply whether or not the e-mail is registered, so nobody can probe for accounts.
    res.status(202).json({ message: 'If an account exists for that address, a reset link has been sent.' });
  });

  router.post('/auth/password/reset', async (req, res) => {
    const body = parse(z.object({ token: z.string().min(20).max(200), password }), req.body);
    await service.resetPassword(body.token, body.password);
    res.status(204).end();
  });

  return router;
}
