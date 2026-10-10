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
