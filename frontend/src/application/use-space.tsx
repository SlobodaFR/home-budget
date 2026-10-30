import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { findSpace, Space, SpaceKind } from '../domain/household';
import { preferences } from '../infrastructure/local-store';
import { useRequiredHousehold } from './use-household';

interface SpaceContextValue {
  kind: SpaceKind;
  space: Space;
  hasPersonalSpace: boolean;
  setKind: (kind: SpaceKind) => void;
}

const SpaceContext = createContext<SpaceContextValue | null>(null);

export function SpaceProvider({ children }: { children: ReactNode }) {
  const household = useRequiredHousehold();
  const [storedKind, setStoredKind] = useState<SpaceKind>(() => preferences.getSpaceKind());

  const setKind = useCallback((next: SpaceKind) => {
    preferences.setSpaceKind(next);
    setStoredKind(next);
  }, []);

  const value = useMemo<SpaceContextValue | null>(() => {
    const common = findSpace(household, 'COMMON');
    const personal = findSpace(household, 'PERSONAL');
    const space = (storedKind === 'PERSONAL' ? personal : common) ?? common ?? personal;
    if (!space) {
      return null;
    }
    return { kind: space.kind, space, hasPersonalSpace: personal !== undefined, setKind };
  }, [household, storedKind, setKind]);

  if (!value) {
    return <p className="p-margin-mobile text-center text-mute">Aucun espace disponible pour ce foyer.</p>;
  }
  return <SpaceContext.Provider value={value}>{children}</SpaceContext.Provider>;
}

export function useSpace(): SpaceContextValue {
  const context = useContext(SpaceContext);
  if (!context) {
    throw new Error('useSpace must be used within a SpaceProvider');
  }
  return context;
}
