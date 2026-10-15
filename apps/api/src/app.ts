/**
 * What this file does
 *   Builds the Express web application: security middleware, the /api router with every
 *   feature module, and one central error handler that turns errors into JSON replies.
 *
 * How it works
 *   - createApp() adds helmet (security headers) and CORS for the web client's origin.
 *   - It mounts the storage routes first, then the JSON body parser, then every module router.
 *   - Any request that matches no route falls through to a 404 error.
 *   - errorHandler() maps known errors (HttpError, unique violations, bad JSON, too large) to status codes.
 *
 * Where it fits
 *   Called by server.ts (real server) and test/helpers.ts (tests) with the context from bootstrap.ts.
 *   Module: server core (owner: Vansh).
 */
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import type { ApiErrorBody } from '@docstruct/shared';
import type { AppContext } from './context.js';
import { HttpError, isUniqueViolation } from './lib/errors.js';
import { modules } from './modules/index.js';
import { storageRoutes } from './storage/routes.js';

export function createApp(ctx: AppContext) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  // Helmet adds standard security headers. CORS lets only the configured web client
  // origin call the API from a browser.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({ origin: ctx.config.appUrl, credentials: false }));

  const api = express.Router();
  // The object store reads raw request bodies, so it is mounted before the JSON parser.
  api.use(storageRoutes(ctx));
  api.use(express.json({ limit: '1mb' }));
  // Each module is a function that takes the context and returns its own router.
  for (const mod of modules) api.use(mod(ctx));
  // Catch-all: reached only when no module handled the request.
  api.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'No such endpoint')));

  app.use('/api', api);
  app.use(errorHandler(ctx));
  return app;
}

function errorHandler(ctx: AppContext): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    // Default reply hides internal details; only known error types get a specific message.
    let status = 500;
    let body: ApiErrorBody = { error: { code: 'INTERNAL', message: 'Something went wrong on the server' } };

    if (err instanceof HttpError) {
      status = err.status;
      body = { error: { code: err.code, message: err.message, details: err.details } };
    } else if (isUniqueViolation(err)) {
      // A UNIQUE constraint in the database failed, e.g. a duplicate name or email.
      status = 409;
      body = { error: { code: 'CONFLICT', message: 'That conflicts with an existing record' } };
    } else if (err?.type === 'entity.parse.failed') {
      status = 400;
      body = { error: { code: 'BAD_REQUEST', message: 'Request body is not valid JSON' } };
    } else if (err?.type === 'entity.too.large') {
      status = 413;
      body = { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } };
    } else {
      ctx.log('unhandled error', err);
    }
    // If part of the reply was already sent we cannot send a new status, so skip it.
    if (!res.headersSent) res.status(status).json(body);
  };
}
