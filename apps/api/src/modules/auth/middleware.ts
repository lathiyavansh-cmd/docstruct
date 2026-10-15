/**
 * What this file does
 *   Provides the Express middleware that checks a request is logged in, and a helper to read the logged-in user.
 *
 * How it works
 *   - requireAuth(ctx) reads the "Authorization: Bearer <token>" header.
 *   - It asks AuthService.authenticate() to turn the token into a user, then stores it on req.auth.
 *   - currentUser(req) returns req.auth inside a route, or throws 401 if it is missing.
 *
 * Where it fits
 *   Used by the routes of almost every module (projects, documents, versions, diff, summary and more). Relies on
 *   AuthService in service.ts. Module: M01 Authentication (owner: Vansh).
 */
import type { Request, RequestHandler } from 'express';
import type { AppContext } from '../../context.js';
import { unauthorized } from '../../lib/errors.js';
import type { AuthContext } from '../../types/express.js';
import { AuthService } from './service.js';

// One handler per app context, so every router that calls requireAuth(ctx) shares the same AuthService.
const cache = new WeakMap<AppContext, RequestHandler>();

/**
 * Account.Login / SE-2: every protected route passes through this. It reads the bearer token, resolves the
 * session and attaches `req.auth`. Routes add it explicitly so public endpoints (share links, signed
 * storage URLs) stay reachable without a session.
 */
export function requireAuth(ctx: AppContext): RequestHandler {
  let handler = cache.get(ctx);
  if (!handler) {
    const service = new AuthService(ctx);
    handler = async (req, _res, next) => {
      const header = req.headers.authorization ?? '';
      // The header must be exactly "Bearer <token>". Anything else is rejected with 401 before touching the database.
      const match = /^Bearer\s+(\S+)$/i.exec(header);
      if (!match) return next(unauthorized());
      try {
        // Later handlers read the user id and session id from req.auth.
        req.auth = await service.authenticate(match[1]);
        next();
      } catch (error) {
        next(error);
      }
    };
    cache.set(ctx, handler);
  }
  return handler;
}

/** The authenticated user of a request that passed requireAuth. */
export function currentUser(req: Request): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}
