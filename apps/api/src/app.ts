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
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({ origin: ctx.config.appUrl, credentials: false }));

  const api = express.Router();
  // The object store reads raw request bodies, so it is mounted before the JSON parser.
  api.use(storageRoutes(ctx));
  api.use(express.json({ limit: '1mb' }));
  for (const mod of modules) api.use(mod(ctx));
  api.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'No such endpoint')));

  app.use('/api', api);
  app.use(errorHandler(ctx));
  return app;
}

function errorHandler(ctx: AppContext): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    let status = 500;
    let body: ApiErrorBody = { error: { code: 'INTERNAL', message: 'Something went wrong on the server' } };

    if (err instanceof HttpError) {
      status = err.status;
      body = { error: { code: err.code, message: err.message, details: err.details } };
    } else if (isUniqueViolation(err)) {
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
    if (!res.headersSent) res.status(status).json(body);
  };
}
