import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountsProvider } from '../../application/use-accounts';
import { HouseholdContext, HouseholdContextValue } from '../../application/use-household';
import { OfflineQueueProvider } from '../../application/use-offline-queue';
import { SelectedMonthProvider } from '../../application/use-selected-month';
import { SpaceProvider } from '../../application/use-space';
import { review } from '../../test/fixtures';
import { testHousehold } from '../../test/render-app';

const api = vi.hoisted(() => ({ fetchAccounts: vi.fn(), fetchReview: vi.fn(), fetchReviews: vi.fn() }));

vi.mock('../../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/api-client')>()),
  apiClient: api,
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'alice', email: 'alice@example.test', name: 'Alice' }, loading: false, logout: vi.fn() }),
}));

import { RevuePage } from '../pages/RevuePage';
import { AppShell } from './AppShell';

describe('AppShell on the review page', () => {
  beforeEach(() => {
    api.fetchAccounts.mockResolvedValue([]);
    api.fetchReview.mockImplementation(async (_space: string, month: string) => review({ month }));
    api.fetchReviews.mockResolvedValue([]);
  });

  it('lets you switch space, adds no fifth tab and keeps « Accueil » highlighted', async () => {
    const value: HouseholdContextValue = { household: testHousehold, loading: false, offline: false, failed: false, reload: vi.fn(), setHousehold: vi.fn() };
    render(
      <MemoryRouter initialEntries={['/revue']}>
        <HouseholdContext.Provider value={value}>
          <SpaceProvider>
            <OfflineQueueProvider>
              <AccountsProvider>
                <SelectedMonthProvider initialMonth="2026-11">
                  <Routes>
                    <Route element={<AppShell />}>
                      <Route path="revue" element={<RevuePage />} />
                    </Route>
                  </Routes>
                </SelectedMonthProvider>
              </AccountsProvider>
            </OfflineQueueProvider>
          </SpaceProvider>
        </HouseholdContext.Provider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Ma revue du mois' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Espace' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(within(nav).getAllByRole('link')).toHaveLength(4);
    expect(within(nav).getByRole('link', { name: 'Accueil' }).className).toContain('text-ink');
  });
});
