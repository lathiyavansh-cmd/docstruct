/**
 * What this file does
 *   Defines the HttpError class and short helper functions for the common HTTP errors.
 *
 * How it works
 *   - HttpError carries a status code, a machine-readable code and a readable message.
 *   - Helpers like badRequest(), forbidden() and notFound() build the matching HttpError.
 *   - isUniqueViolation() detects a Postgres duplicate-key error.
 *
 * Where it fits
 *   Thrown by every module; app.ts's error handler turns these into JSON replies.
 *   Module: server core (owner: Vansh).
 */
/** An error that maps directly to an HTTP response (Usability-4: every failure states its reason). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Authentication required') => new HttpError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'You do not have permission to do that') => new HttpError(403, 'FORBIDDEN', message);
export const notFound = (what = 'Resource') => new HttpError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (message: string, code = 'CONFLICT') => new HttpError(409, code, message);
export const payloadTooLarge = (message: string) => new HttpError(413, 'PAYLOAD_TOO_LARGE', message);
export const unsupported = (message: string) => new HttpError(415, 'UNSUPPORTED_FORMAT', message);

/** Postgres error codes the API translates into readable conflicts. */
export function isUniqueViolation(error: unknown): boolean {
  // 23505 is the standard Postgres code for "unique_violation" (a duplicate key).
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}
