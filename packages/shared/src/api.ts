// Request/response shapes of the DocStruct REST API, shared by server and client (Maintainability-2).
// Timestamps travel as ISO-8601 strings.

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

/** Another user as seen alongside their activity (Account.Profile.Scope: display name only). */
export interface UserRefDto {
  userId: string;
  displayName: string;
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
