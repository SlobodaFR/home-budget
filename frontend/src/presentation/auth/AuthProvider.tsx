import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { apiClient, CurrentUser } from '../../infrastructure/api-client';

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
    apiClient
      .fetchCurrentUser()
      .then(setUser)
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(async () => {
    await apiClient.logout();
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
