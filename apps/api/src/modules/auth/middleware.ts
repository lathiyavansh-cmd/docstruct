import type { Request, RequestHandler } from 'express';
import type { AppContext } from '../../context.js';
import { unauthorized } from '../../lib/errors.js';
import type { AuthContext } from '../../types/express.js';
import { AuthService } from './service.js';

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
      const match = /^Bearer\s+(\S+)$/i.exec(header);
      if (!match) return next(unauthorized());
      try {
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
