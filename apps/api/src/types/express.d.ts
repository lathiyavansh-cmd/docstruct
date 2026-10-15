/**
 * What this file does
 *   Tells TypeScript about the extra fields our middleware adds to Express's Request object.
 *
 * How it works
 *   - AuthContext holds the logged-in user and session ids.
 *   - MembershipContext holds the user's role in the current project.
 *   - "declare global" adds req.auth and req.membership to every Express Request type.
 *
 * Where it fits
 *   Type-only file (no runtime code). Used by the auth and RBAC middleware and every route
 *   that reads req.auth or req.membership. Module: server core (owner: Vansh).
 */
import type { ProjectRole } from '@docstruct/shared';

export interface AuthContext {
  userId: string;
  sessionId: string;
  email: string;
  displayName: string;
}

export interface MembershipContext {
  projectId: string;
  role: ProjectRole;
  archived: boolean;
}

// Declaration merging: this adds fields to Express's own Request interface instead of replacing it.
declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth for every authenticated request. */
      auth?: AuthContext;
      /** Set by the RBAC middleware once the caller's project membership is resolved. */
      membership?: MembershipContext;
    }
  }
}
