import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { clearAuthToken, getMe, login, logout, setAuthToken, type User } from './api';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  setSession: (token: string, user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function refresh() {
    setIsLoading(true);
    try {
      const payload = await getMe();
      setUser(payload.user);
    } catch {
      clearAuthToken();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    async signIn(email, password) {
      const payload = await login({ email, password });
      setAuthToken(payload.token);
      setUser(payload.user);
      return payload.user;
    },
    async signOut() {
      try {
        await logout();
      } finally {
        clearAuthToken();
        setUser(null);
      }
    },
    refresh,
    setSession(token, nextUser) {
      setAuthToken(token);
      setUser(nextUser);
    }
  }), [user, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
