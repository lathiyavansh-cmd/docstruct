/**
 * What this file does
 *   The single place where the web app talks to the DocStruct server. Every request goes through
 *   api(), which adds the login token and turns server errors into readable ApiError objects.
 *
 * How it works
 *   - The session token is kept in a module variable and copied to localStorage under 'docstruct.session',
 *     so a page refresh keeps the user logged in.
 *   - api() builds the URL as /api + path, adds query parameters, sends JSON and an
 *     "Authorization: Bearer <token>" header.
 *   - A 401 reply on a logged-in request tells every onSessionExpired listener, so the app can go back to login.
 *   - get, post, patch and del are short helpers on top of api(); errorMessage() gives text for toasts.
 *
 * Where it fits
 *   Used by almost every page and component (and by lib/auth.tsx, lib/hooks.ts, lib/upload.ts).
 *   Module: app shell / shared UI, M01 (owner: Vansh).
 */
import type { ApiErrorBody } from '@docstruct/shared';

/** An error returned by the DocStruct API, carrying its code and readable message (Usability-4). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const TOKEN_KEY = 'docstruct.session';

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

// The current token, loaded once when the app starts. Listeners are the functions to call when the session expires.
let token: string | null = readToken();
const listeners = new Set<() => void>();

export function setToken(value: string | null) {
  token = value;
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: the session lasts for this tab only */
  }
}

export function getToken() {
  return token;
}

/** Called when the server says the session ended, so the app can return to the login screen. */
export function onSessionExpired(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

type Query = Record<string, string | number | boolean | null | undefined>;

export async function api<T>(path: string, init: { method?: string; body?: unknown; query?: Query } = {}): Promise<T> {
  let url = `/api${path}`;
  if (init.query) {
    // Empty, null and undefined values are left out of the query string.
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(init.query)) if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      // Send JSON only when there is a body, and the Bearer token only when the user is logged in.
      headers: {
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    // CI-7: the connection was interrupted.
    throw new ApiError(0, 'NETWORK', 'Could not reach DocStruct. Check your internet connection and try again.');
  }
  // 204 means "done, no content", so there is no JSON to read.
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    // 401 on a logged-in request means the session ended. A wrong password on the login call does not count.
    if (response.status === 401 && token && path !== '/auth/login') listeners.forEach((l) => l());
    throw new ApiError(response.status, err?.code ?? 'ERROR', err?.message ?? `Request failed (${response.status})`, err?.details);
  }
  return data as T;
}

export const get = <T>(path: string, query?: Query) => api<T>(path, { query });
export const post = <T>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body });
export const del = <T>(path: string, query?: Query) => api<T>(path, { method: 'DELETE', query });

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}
