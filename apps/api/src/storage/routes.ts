/**
 * What this file does
 *   The HTTP endpoints that signed storage links point to: PUT uploads a file, GET downloads it.
 *
 * How it works
 *   - signedQuery is the Zod schema for the link's query string fields.
 *   - check() validates the query, confirms the operation matches, and verifies the signature and expiry.
 *   - PUT /storage/object streams the request body into the object store with a size limit.
 *   - GET /storage/object streams the file back with safe download headers.
 *
 * Where it fits
 *   Mounted in app.ts before the JSON parser, because uploads arrive as raw bytes.
 *   Uses object-store.ts. Module: storage, shared core (owner: Vansh).
 */
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
    // A download link cannot be reused to upload, and the other way round.
    if (params.op !== op) throw forbidden('This link does not allow that operation');
    const verdict = ctx.storage.verify(params as SignedParams, sig);
    if (verdict === 'expired') throw new HttpError(403, 'LINK_EXPIRED', 'This link has expired - request a new one');
    if (verdict === 'invalid') throw forbidden('Invalid or tampered link');
    return params as SignedParams;
  };

  router.put('/storage/object', async (req, res) => {
    const params = check(req.query, 'put');
    const max = params.max ?? 0;
    // Early reject using the declared size. The store still counts real bytes, in case the header lies.
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > max) throw payloadTooLarge(`File is larger than the ${max}-byte limit for this upload`);
    try {
      const bytes = await ctx.storage.write(params.key, req, max);
      res.status(201).json({ key: params.key, bytes });
    } catch (error) {
      // Objects are write-once, so a second upload to the same link is refused.
      if (error instanceof ObjectExistsError) throw new HttpError(409, 'ALREADY_UPLOADED', 'This upload link was already used');
      if (error instanceof ObjectTooLargeError) throw payloadTooLarge('File exceeds the size limit for this upload');
      throw error;
    }
  });

  router.get('/storage/object', async (req, res) => {
    const params = check(req.query, 'get');
    const size = await ctx.storage.size(params.key);
    if (size === null) throw new HttpError(404, 'NOT_FOUND', 'File not found');
    // Remove quotes and line breaks so the file name cannot break out of the HTTP header.
    // The plain filename gets ASCII only; filename* carries the full UTF-8 name.
    const fileName = (params.fn ?? 'download').replace(/["\r\n]/g, '');
    res.setHeader('Content-Type', params.ct ?? 'application/octet-stream');
    res.setHeader('Content-Length', String(size));
    res.setHeader(
      'Content-Disposition',
      `${params.disp ?? 'attachment'}; filename="${fileName.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    res.setHeader('Cache-Control', 'private, max-age=60');
    // nosniff stops the browser from guessing a different type (for example running a file as HTML).
    res.setHeader('X-Content-Type-Options', 'nosniff');
    ctx.storage.stream(params.key).pipe(res);
  });

  return router;
}
