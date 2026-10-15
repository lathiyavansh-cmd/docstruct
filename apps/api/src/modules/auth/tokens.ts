/**
 * What this file does
 *   Creates random tokens and hashes them. Used for login sessions and password reset links.
 *
 * How it works
 *   - newToken() makes 32 random bytes and encodes them as URL-safe text.
 *   - hashToken() turns a token into its SHA-256 hex digest, which is what the database stores.
 *
 * Where it fits
 *   Called only by AuthService (service.ts). Module: M01 Authentication (owner: Vansh).
 */
import { createHash, randomBytes } from 'node:crypto';

/** 256-bit random token, URL-safe. Returned to the client once; only its hash is stored. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

// A plain SHA-256 is enough here because the token is already long and random. If the database leaks,
// the stored hashes cannot be used as login tokens.
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
