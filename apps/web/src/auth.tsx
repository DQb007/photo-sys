import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { clearAuthToken, createGuestSession, getGuestSession, getMe, login, logout, setAuthToken, type GuestSession, type User } from './api';

interface AuthContextValue {
  user: User | null;
  guestSession: GuestSession | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  ensureGuestSession: () => Promise<GuestSession>;
  refreshGuestSession: () => Promise<void>;
  setSession: (token: string, user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [guestSession, setGuestSession] = useState<GuestSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function refresh() {
    setIsLoading(true);
    try {
      const payload = await getMe();
      setUser(payload.user);
      if (payload.user) setGuestSession(null);
    } catch {
      clearAuthToken();
      setUser(null);
      await refreshGuestSession().catch(() => undefined);
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshGuestSession() {
    const payload = await getGuestSession();
    setGuestSession(payload.session);
  }

  async function ensureGuestSession() {
    if (guestSession) return guestSession;
    try {
      const payload = await getGuestSession();
      setGuestSession(payload.session);
      return payload.session;
    } catch {
      const session = await createGuestSession();
      setGuestSession(session);
      return session;
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    guestSession,
    isLoading,
    async signIn(email, password) {
      const payload = await login({ email, password });
      setAuthToken(payload.token);
      setUser(payload.user);
      setGuestSession(null);
      return payload.user;
    },
    async signOut() {
      try {
        await logout();
      } finally {
        clearAuthToken();
        setUser(null);
        await ensureGuestSession().catch(() => setGuestSession(null));
      }
    },
    refresh,
    ensureGuestSession,
    refreshGuestSession,
    setSession(token, nextUser) {
      setAuthToken(token);
      setUser(nextUser);
      setGuestSession(null);
    }
  }), [user, guestSession, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
