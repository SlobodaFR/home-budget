import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Household } from '../domain/household';
import { isOfflineError } from './error-message';
import { apiClient } from '../infrastructure/api-client';
import { sessionCache } from '../infrastructure/local-store';
import { useAuth } from '../presentation/auth/AuthProvider';

export interface HouseholdContextValue {
  household: Household | null;
  loading: boolean;
  offline: boolean;
  failed: boolean;
  reload: () => Promise<void>;
  setHousehold: (household: Household | null) => void;
}

export const HouseholdContext = createContext<HouseholdContextValue | null>(null);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [household, setHouseholdState] = useState<Household | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [failed, setFailed] = useState(false);

  const setHousehold = useCallback(
    (next: Household | null) => {
      setHouseholdState(next);
      setOffline(false);
      if (user) {
        sessionCache.saveHousehold(user, next);
      }
    },
    [user],
  );

  const reload = useCallback(async () => {
    try {
      setHousehold(await apiClient.fetchHousehold());
      setFailed(false);
    } catch (error) {
      const cached = sessionCache.load();
      if (isOfflineError(error) && cached?.household && cached.user.id === user?.id) {
        setHouseholdState(cached.household);
        setOffline(true);
        setFailed(false);
      } else {
        setFailed(true);
      }
    } finally {
      setLoading(false);
    }
  }, [setHousehold, user?.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!offline) {
      return undefined;
    }
    const handleOnline = () => void reload();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [offline, reload]);

  const value = useMemo(
    () => ({ household, loading, offline, failed, reload, setHousehold }),
    [household, loading, offline, failed, reload, setHousehold],
  );
  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold(): HouseholdContextValue {
  const context = useContext(HouseholdContext);
  if (!context) {
    throw new Error('useHousehold must be used within a HouseholdProvider');
  }
  return context;
}

export function useRequiredHousehold(): Household {
  const { household } = useHousehold();
  if (!household) {
    throw new Error('Aucun foyer');
  }
  return household;
}
