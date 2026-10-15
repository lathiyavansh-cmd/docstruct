/**
 * What this file does
 *   Keeps track of who is logged in and shares that with the whole app through React context.
 *   Components call useAuth() to read the user or to sign in and out.
 *
 * How it works
 *   - On start, if a token is saved, it calls GET /auth/me to load the profile. A failed call clears the token.
 *   - It listens to onSessionExpired from lib/api.ts. When the server rejects the token it clears the user,
 *     sets expired = true and empties the TanStack Query cache.
 *   - signIn() saves the token from a login or sign-up reply. signOut() calls POST /auth/logout, then clears
 *     the token, the user and the query cache.
 *
 * Where it fits
 *   AuthProvider wraps the app in main.tsx. useAuth() is used by App.tsx, AppLayout, ReviewPanel, the login and
 *   sign-up pages, ProfilePage and ProjectsPage. Module: M01 accounts (owner: Vansh).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ProfileDto, SessionDto } from '@docstruct/shared';
import { get, getToken, onSessionExpired, post, setToken } from './api';

interface AuthState {
  user: ProfileDto | null;
  loading: boolean;
  /** Set when the server ended the session (logout elsewhere, idle timeout). */
  expired: boolean;
  signIn(session: SessionDto): void;
  signOut(): Promise<void>;
  setUser(user: ProfileDto): void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ProfileDto | null>(null);
  // Start in "loading" only if there is a saved token to check; otherwise we already know nobody is logged in.
  const [loading, setLoading] = useState(!!getToken());
  const [expired, setExpired] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!getToken()) return;
    get<ProfileDto>('/auth/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(
    () =>
      onSessionExpired(() => {
        setToken(null);
        setUser(null);
        setExpired(true);
        // Drop all cached data so the next user cannot see the previous user's documents.
        queryClient.clear();
      }),
    [queryClient],
  );

  const signIn = useCallback((session: SessionDto) => {
    setToken(session.token);
    setUser(session.user);
    setExpired(false);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await post('/auth/logout');
    } catch {
      /* the session may already be gone */
    }
    setToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  // useMemo keeps the same object between renders, so components using useAuth() only re-render when a value changes.
  const value = useMemo(() => ({ user, loading, expired, signIn, signOut, setUser }), [user, loading, expired, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
