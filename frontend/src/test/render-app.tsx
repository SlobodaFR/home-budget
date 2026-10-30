import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { HouseholdContext, HouseholdContextValue } from '../application/use-household';
import { OfflineQueueProvider } from '../application/use-offline-queue';
import { SelectedMonthProvider } from '../application/use-selected-month';
import { SpaceProvider } from '../application/use-space';
import { Household, SpaceKind } from '../domain/household';
import { preferences } from '../infrastructure/local-store';
import { ToastProvider } from '../presentation/components/Toast';

export const testHousehold: Household = {
  id: 'h1',
  name: 'Famille',
  role: 'OWNER',
  contributionMode: 'EQUAL',
  members: [{ userId: 'alice', name: 'Alice', role: 'OWNER', netMonthlyIncomeCents: 350000 }],
  spaces: [
    { id: 's-common', kind: 'COMMON', name: 'Commun' },
    { id: 's-alice', kind: 'PERSONAL', name: 'Perso' },
  ],
};

interface Options {
  path?: string;
  month?: string;
  kind?: SpaceKind;
}

/** Monte une page avec tous les fournisseurs de l'application (foyer, espace, file hors ligne, mois, toasts). */
export function renderInApp(page: ReactElement, { path = '/', month = '2026-11', kind = 'COMMON' }: Options = {}) {
  preferences.setSpaceKind(kind);
  const value: HouseholdContextValue = {
    household: testHousehold,
    loading: false,
    offline: false,
    failed: false,
    reload: vi.fn(),
    setHousehold: vi.fn(),
  };
  render(
    <MemoryRouter initialEntries={[path]}>
      <HouseholdContext.Provider value={value}>
        <SpaceProvider>
          <OfflineQueueProvider>
            <SelectedMonthProvider initialMonth={month}>
              <ToastProvider>{page}</ToastProvider>
            </SelectedMonthProvider>
          </OfflineQueueProvider>
        </SpaceProvider>
      </HouseholdContext.Provider>
    </MemoryRouter>,
  );
  return userEvent.setup();
}
