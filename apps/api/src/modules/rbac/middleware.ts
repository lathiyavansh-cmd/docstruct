/**
 * What this file does
 *   Decides whether the logged-in user may perform an action inside a project, based on their project role.
 *
 * How it works
 *   - Resolver helpers (byProject, byDocument, byVersion, ...) find which project a URL id belongs to.
 *   - loadMembership() reads the user's role in that project from project_members.
 *   - authorize(ctx, permission, resolver) is the middleware: it runs the resolver, loads the role, and
 *     checks the permission with can() from the shared package.
 *   - membershipOf(req) lets a route read the membership that authorize() attached.
 *
 * Where it fits
 *   Placed after requireAuth on every project-scoped route (documents, versions, diff, summary, reviews and
 *   more). The role-to-permission table lives in packages/shared/src/permissions.ts.
 *   Module: M06 Role-Based Access Control (owner: Vansh).
 */
import type { Request, RequestHandler } from 'express';
import { READ_ONLY_PERMISSIONS, can, type Permission, type ProjectRole } from '@docstruct/shared';
import type { AppContext } from '../../context.js';
import type { Queryable } from '../../db/database.js';
import { HttpError, forbidden, notFound } from '../../lib/errors.js';
import type { MembershipContext } from '../../types/express.js';
import { currentUser } from '../auth/middleware.js';

/**
 * Finds the project that a request targets. Most routes name the project directly; routes about a
 * document, folder, version, review or annotation are resolved through that entity, so a user can never
 * reach another project's data by guessing an id (SE-6, Search.Scope, Share.Scope).
 */
export type ProjectResolver = (q: Queryable, req: Request) => Promise<{ projectId: string; label: string } | null>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function lookup(sql: string, param: string, what: string): ProjectResolver {
  return async (q, req) => {
    const id = req.params[param];
    // A malformed id is treated as "not found" straight away, so it never reaches the SQL query.
    if (typeof id !== 'string' || !UUID.test(id)) throw notFound(what);
    const { rows } = await q.query<{ project_id: string }>(sql, [id]);
    return rows[0] ? { projectId: rows[0].project_id, label: what } : null;
  };
}

export const byProject = (param = 'projectId'): ProjectResolver =>
  lookup('SELECT project_id FROM projects WHERE project_id = $1', param, 'Project');
export const byFolder = (param = 'folderId'): ProjectResolver =>
  lookup('SELECT project_id FROM folders WHERE folder_id = $1', param, 'Folder');
export const byDocument = (param = 'documentId'): ProjectResolver =>
  lookup('SELECT project_id FROM documents WHERE document_id = $1 AND deleted_at IS NULL', param, 'Document');
// A version has no project column, so we join through its document. Deleted documents count as missing.
export const byVersion = (param = 'versionId'): ProjectResolver =>
  lookup(
    `SELECT d.project_id FROM document_versions v JOIN documents d ON d.document_id = v.document_id
      WHERE v.version_id = $1 AND d.deleted_at IS NULL`,
    param,
    'Version',
  );
export const byReview = (param = 'reviewId'): ProjectResolver =>
  lookup(
    `SELECT d.project_id FROM reviews r JOIN documents d ON d.document_id = r.document_id
      WHERE r.review_id = $1 AND d.deleted_at IS NULL`,
    param,
    'Review',
  );
export const byAnnotation = (param = 'annotationId'): ProjectResolver =>
  lookup(
    `SELECT d.project_id FROM annotations a
       JOIN document_versions v ON v.version_id = a.version_id
       JOIN documents d ON d.document_id = v.document_id
      WHERE a.annotation_id = $1 AND d.deleted_at IS NULL`,
    param,
    'Annotation',
  );
export const byShare = (param = 'shareId'): ProjectResolver =>
  lookup(
    `SELECT d.project_id FROM share_links s JOIN documents d ON d.document_id = s.document_id WHERE s.share_id = $1`,
    param,
    'Share link',
  );

/** Loads the caller's membership in a project, or null if they hold none. */
export async function loadMembership(q: Queryable, projectId: string, userId: string): Promise<MembershipContext | null> {
  // One query returns both the role and whether the project is archived.
  const { rows } = await q.query<{ role: ProjectRole; archived: boolean }>(
    `SELECT m.role, p.archived_at IS NOT NULL AS archived
       FROM project_members m JOIN projects p ON p.project_id = m.project_id
      WHERE m.project_id = $1 AND m.user_id = $2`,
    [projectId, userId],
  );
  return rows[0] ? { projectId, role: rows[0].role, archived: rows[0].archived } : null;
}

/**
 * Authorises one action inside a project (Algorithm C `authorise`):
 *  - no membership             -> 404, so another project's resources stay invisible (SE-6)
 *  - role lacks the permission -> 403 (SE-5, SE-7, SE-8)
 *  - project archived and the action is not read-only -> 409 (Project.Archive, SA-7)
 * On success the membership is attached as `req.membership`.
 */
export function authorize(ctx: AppContext, permission: Permission, resolve: ProjectResolver): RequestHandler {
  return async (req, _res, next) => {
    try {
      const user = currentUser(req);
      const target = await resolve(ctx.db, req);
      if (!target) throw notFound(permissionSubject(permission));
      const membership = await loadMembership(ctx.db, target.projectId, user.userId);
      if (!membership) throw notFound(target.label);
      // can() expands the role through the inheritance graph (OWNER gets EDITOR and REVIEWER rights, and so on).
      if (!can(membership.role, permission)) throw forbidden(`Your role (${membership.role.toLowerCase()}) does not allow this action`);
      if (membership.archived && !READ_ONLY_PERMISSIONS.has(permission)) {
        throw new HttpError(409, 'PROJECT_ARCHIVED', 'This project is archived and is now read-only');
      }
      req.membership = membership;
      next();
    } catch (error) {
      next(error);
    }
  };
}

// Turns a permission like "document.read" into "Document" for the 404 message.
function permissionSubject(permission: Permission): string {
  const noun = permission.split('.')[0];
  return noun.charAt(0).toUpperCase() + noun.slice(1);
}

export function membershipOf(req: Request): MembershipContext {
  if (!req.membership) throw forbidden();
  return req.membership;
}
