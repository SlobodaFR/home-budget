import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountsProvider } from '../../application/use-accounts';
import { HouseholdContext, HouseholdContextValue } from '../../application/use-household';
import { OfflineQueueProvider } from '../../application/use-offline-queue';
import { SelectedMonthProvider } from '../../application/use-selected-month';
import { SpaceProvider } from '../../application/use-space';
import { testHousehold } from '../../test/render-app';

const api = vi.hoisted(() => ({ fetchAccounts: vi.fn() }));

vi.mock('../../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/api-client')>()),
  apiClient: api,
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'alice', email: 'alice@example.test', name: 'Alice' }, loading: false, logout: vi.fn() }),
}));

import { AppShell } from './AppShell';

function renderShell(path: string) {
  const value: HouseholdContextValue = { household: testHousehold, loading: false, offline: false, failed: false, reload: vi.fn(), setHousehold: vi.fn() };
  render(
    <MemoryRouter initialEntries={[path]}>
      <HouseholdContext.Provider value={value}>
        <SpaceProvider>
          <OfflineQueueProvider>
            <AccountsProvider>
              <SelectedMonthProvider initialMonth="2026-11">
                <Routes>
                  <Route element={<AppShell />}>
                    <Route index element={<p>Accueil</p>} />
                    <Route path="foyer" element={<p>Foyer</p>} />
                    <Route path="aide" element={<p>Contenu de l’aide</p>} />
                  </Route>
                </Routes>
              </SelectedMonthProvider>
            </AccountsProvider>
          </OfflineQueueProvider>
        </SpaceProvider>
      </HouseholdContext.Provider>
    </MemoryRouter>,
  );
}

describe('AppShell : accès à l’aide', () => {
  beforeEach(() => {
    api.fetchAccounts.mockReset();
    api.fetchAccounts.mockResolvedValue([]);
  });

  it('puts a help link in the header of the pages that show the space switcher', () => {
    renderShell('/');
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: 'Aide et documentation' })).toHaveAttribute('href', '/aide');
  });

  it('makes the help link a comfortable touch target (at least 44 px)', () => {
    renderShell('/');
    expect(screen.getByRole('link', { name: 'Aide et documentation' }).className).toMatch(/h-\[52px\].*w-\[52px\]/);
  });

  it('does not add a fifth tab to the tab bar', () => {
    renderShell('/');
    const tabs = within(screen.getByRole('navigation', { name: 'Navigation principale' })).getAllByRole('link');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Accueil', 'Plan', 'Prévisionnel', 'Foyer']);
  });

  it('titles the help page itself (h1) and keeps « Foyer » highlighted, like the other secondary pages', () => {
    renderShell('/aide');
    expect(screen.getByRole('heading', { level: 1, name: 'Aide et documentation' })).toBeInTheDocument();
    expect(screen.getByText('Contenu de l’aide')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(within(nav).getByRole('link', { name: 'Foyer' }).className).toContain('text-ink');
    expect(within(nav).getByRole('link', { name: 'Accueil' }).className).toContain('text-mute');
    // pas de lien d'aide dans l'en-tête de l'aide elle-même
    expect(within(screen.getByRole('banner')).queryByRole('link', { name: 'Aide et documentation' })).not.toBeInTheDocument();
  });

  it('keeps the usual title on the other secondary pages', () => {
    renderShell('/foyer');
    expect(screen.getByRole('heading', { level: 1, name: 'Foyer' })).toBeInTheDocument();
  });
});
