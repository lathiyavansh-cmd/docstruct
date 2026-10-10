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

  const value = useMemo(() => ({ user, loading, expired, signIn, signOut, setUser }), [user, loading, expired, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
