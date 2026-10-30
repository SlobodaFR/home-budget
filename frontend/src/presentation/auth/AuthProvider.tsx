import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiClient, CurrentUser, onUnauthorized } from '../../infrastructure/api-client';
import { sessionCache } from '../../infrastructure/local-store';

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiClient
      .fetchCurrentUser()
      .then((current) => {
        if (current) {
          sessionCache.saveUser(current);
        } else {
          sessionCache.clear();
        }
        return current;
      })
      .catch(() => sessionCache.load()?.user ?? null)
      .then((current) => {
        if (active) {
          setUser(current);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    onUnauthorized(() => {
      sessionCache.clear();
      setUser(null);
    });
    return () => onUnauthorized(null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } finally {
      sessionCache.clear();
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, loading, logout }), [user, loading, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
