import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountsProvider } from '../../application/use-accounts';
import { HouseholdContext, HouseholdContextValue } from '../../application/use-household';
import { OfflineQueueProvider } from '../../application/use-offline-queue';
import { SelectedMonthProvider } from '../../application/use-selected-month';
import { SpaceProvider } from '../../application/use-space';
import { parseTrends } from '../../domain/trends';
import { testHousehold } from '../../test/render-app';

const api = vi.hoisted(() => ({ fetchAccounts: vi.fn(), fetchTrends: vi.fn() }));

vi.mock('../../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/api-client')>()),
  apiClient: api,
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'alice', email: 'alice@example.test', name: 'Alice' }, loading: false, logout: vi.fn() }),
}));

import { TendancesPage } from '../pages/TendancesPage';
import { AppShell } from './AppShell';

describe('AppShell on the trends page', () => {
  beforeEach(() => {
    api.fetchAccounts.mockResolvedValue([]);
    api.fetchTrends.mockResolvedValue(parseTrends({ months: [{ month: '2026-10', incomeCents: 380000, expenseCents: 351000 }] }));
  });

  it('lets you switch space, adds no fifth tab and keeps « Accueil » highlighted', async () => {
    const value: HouseholdContextValue = { household: testHousehold, loading: false, offline: false, failed: false, reload: vi.fn(), setHousehold: vi.fn() };
    render(
      <MemoryRouter initialEntries={['/tendances']}>
        <HouseholdContext.Provider value={value}>
          <SpaceProvider>
            <OfflineQueueProvider>
              <AccountsProvider>
                <SelectedMonthProvider initialMonth="2026-11">
                  <Routes>
                    <Route element={<AppShell />}>
                      <Route path="tendances" element={<TendancesPage />} />
                    </Route>
                  </Routes>
                </SelectedMonthProvider>
              </AccountsProvider>
            </OfflineQueueProvider>
          </SpaceProvider>
        </HouseholdContext.Provider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Tendances communes' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Espace' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(within(nav).getAllByRole('link')).toHaveLength(4);
    expect(within(nav).getByRole('link', { name: 'Accueil' }).className).toContain('text-ink');
  });
});
