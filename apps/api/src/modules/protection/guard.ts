/**
 * What this file does
 *   Middleware that stops a request for a password-protected document's contents unless the caller has
 *   unlocked it in this login session.
 *
 * How it works
 *   - requireUnlocked(ctx, from) finds the document the request is about, from a document, version,
 *     annotation or review id in the URL.
 *   - It then asks ProtectionService.assertUnlocked(), which answers 423 Locked when the password is needed.
 *   - It runs after requireAuth and authorize(), so the caller is already known to be a project member.
 *
 * Where it fits
 *   Added to every route that reveals contents: preview and download links, comments, comparison,
 *   pre-review and the summary. Module: M06 Security, document protection (owner: Vansh).
 */
import type { RequestHandler } from 'express';
import type { AppContext } from '../../context.js';
import { notFound } from '../../lib/errors.js';
import { currentUser } from '../auth/middleware.js';
import { ProtectionService } from './service.js';

type Source = 'document' | 'version' | 'annotation' | 'review';

// How to find the document id from each kind of id in the URL.
const LOOKUP: Record<Exclude<Source, 'document'>, { param: string; sql: string }> = {
  version: { param: 'versionId', sql: 'SELECT document_id FROM document_versions WHERE version_id = $1' },
  // A comment belongs to a version, so the document is found through the version.
  annotation: {
    param: 'annotationId',
    sql: 'SELECT v.document_id FROM annotations a JOIN document_versions v ON v.version_id = a.version_id WHERE a.annotation_id = $1',
  },
  review: { param: 'reviewId', sql: 'SELECT document_id FROM reviews WHERE review_id = $1' },
};

export function requireUnlocked(ctx: AppContext, from: Source): RequestHandler {
  const protection = new ProtectionService(ctx);
  return async (req, _res, next) => {
    try {
      let documentId: string;
      if (from === 'document') {
        documentId = req.params.documentId as string;
      } else {
        const { param, sql } = LOOKUP[from];
        const { rows } = await ctx.db.query<{ document_id: string }>(sql, [req.params[param]]);
        if (!rows[0]) throw notFound('Document');
        documentId = rows[0].document_id;
      }
      await protection.assertUnlocked(documentId, currentUser(req));
      next();
    } catch (error) {
      next(error);
    }
  };
}
