import { Router } from 'express';
import { z } from 'zod';
import { HttpError, forbidden, payloadTooLarge } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import type { AppContext } from '../context.js';
import { ObjectExistsError, ObjectTooLargeError, type SignedParams } from './object-store.js';

const signedQuery = z.object({
  op: z.enum(['get', 'put']),
  key: z.string().min(1),
  exp: z.coerce.number().int(),
  max: z.coerce.number().int().positive().optional(),
  ct: z.string().optional(),
  fn: z.string().optional(),
  disp: z.enum(['inline', 'attachment']).optional(),
  sig: z.string(),
});

/**
 * The object-store endpoint that signed URLs point at. It needs no session: possession of a valid, unexpired
 * signature is the authorisation, granted by the API after its own permission checks.
 */
export function storageRoutes(ctx: AppContext): Router {
  const router = Router();

  const check = (query: unknown, op: 'get' | 'put') => {
    const { sig, ...params } = parse(signedQuery, query);
    if (params.op !== op) throw forbidden('This link does not allow that operation');
    const verdict = ctx.storage.verify(params as SignedParams, sig);
    if (verdict === 'expired') throw new HttpError(403, 'LINK_EXPIRED', 'This link has expired - request a new one');
    if (verdict === 'invalid') throw forbidden('Invalid or tampered link');
    return params as SignedParams;
  };

  router.put('/storage/object', async (req, res) => {
    const params = check(req.query, 'put');
    const max = params.max ?? 0;
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > max) throw payloadTooLarge(`File is larger than the ${max}-byte limit for this upload`);
    try {
      const bytes = await ctx.storage.write(params.key, req, max);
      res.status(201).json({ key: params.key, bytes });
    } catch (error) {
      if (error instanceof ObjectExistsError) throw new HttpError(409, 'ALREADY_UPLOADED', 'This upload link was already used');
      if (error instanceof ObjectTooLargeError) throw payloadTooLarge('File exceeds the size limit for this upload');
      throw error;
    }
  });

  router.get('/storage/object', async (req, res) => {
    const params = check(req.query, 'get');
    const size = await ctx.storage.size(params.key);
    if (size === null) throw new HttpError(404, 'NOT_FOUND', 'File not found');
    const fileName = (params.fn ?? 'download').replace(/["\r\n]/g, '');
    res.setHeader('Content-Type', params.ct ?? 'application/octet-stream');
    res.setHeader('Content-Length', String(size));
    res.setHeader(
      'Content-Disposition',
      `${params.disp ?? 'attachment'}; filename="${fileName.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    ctx.storage.stream(params.key).pipe(res);
  });

  return router;
}
