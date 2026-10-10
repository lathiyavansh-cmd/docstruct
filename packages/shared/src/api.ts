// Request/response shapes of the DocStruct REST API, shared by server and client (Maintainability-2).
// Timestamps travel as ISO-8601 strings.

import type { ProjectRole } from './enums.js';

/** Every error response has this body (Usability-4: state the reason). */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ProfileDto {
  userId: string;
  email: string;
  displayName: string;
  createdAt: string;
}

/** Returned by sign-up and login. The token is sent back as `Authorization: Bearer <token>`. */
export interface SessionDto {
  token: string;
  /** Absolute expiry; the session also ends after the configured idle period. */
  expiresAt: string;
  idleMinutes: number;
  user: ProfileDto;
}

export interface SignUpRequest {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export const PASSWORD_MIN_LENGTH = 8;

/** Another user as seen alongside their activity (Account.Profile.Scope: display name only). */
export interface UserRefDto {
  userId: string;
  displayName: string;
}

// ---- M02 projects and membership -------------------------------------------------------------

export interface ProjectDto {
  projectId: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  /** The caller's role in this project (UI-11). */
  myRole: ProjectRole;
  memberCount: number;
}

export interface MemberDto {
  userId: string;
  displayName: string;
  role: ProjectRole;
  addedAt: string;
  isYou: boolean;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
}

export interface AddMemberRequest {
  email: string;
  role: ProjectRole;
}

export interface ActivityEntryDto {
  logId: string;
  projectId: string;
  actor: UserRefDto | null;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface HealthDto {
  status: 'ok';
  version: string;
  database: 'embedded' | 'postgres';
}
