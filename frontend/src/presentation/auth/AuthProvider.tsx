import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  apiClient,
  CurrentUser,
  onUnauthorized,
} from '../../infrastructure/api-client';
import { sessionCache } from '../../infrastructure/local-store';

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Top-level navigation (never fetch): home-auth's logout needs its SSO cookie. */
function navigateTo(url: string): void {
  window.location.assign(url);
}

export function AuthProvider({
  children,
  navigate = navigateTo,
}: {
  children: ReactNode;
  navigate?: (url: string) => void;
}) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void apiClient
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
    let redirectTo: string | null = null;
    try {
      ({ redirectTo } = await apiClient.logout());
    } catch (error) {
      sessionCache.clear();
      setUser(null);
      throw error;
    }
    // Always, before leaving: the offline fallback must not resurrect the user on return.
    sessionCache.clear();
    if (redirectTo) {
      // The page leaves for home-auth, which sends the browser back to /login.
      navigate(redirectTo);
      return;
    }
    setUser(null);
  }, [navigate]);

  const value = useMemo(
    () => ({ user, loading, logout }),
    [user, loading, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
