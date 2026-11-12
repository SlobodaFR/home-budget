import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountsProvider } from '../../application/use-accounts';
import { HouseholdContext, HouseholdContextValue } from '../../application/use-household';
import { OfflineQueueProvider } from '../../application/use-offline-queue';
import { SelectedMonthProvider } from '../../application/use-selected-month';
import { SpaceProvider } from '../../application/use-space';
import { APP_ROUTES } from '../../domain/routes';
import { testHousehold } from '../../test/render-app';

const api = vi.hoisted(() => ({ fetchAccounts: vi.fn<ApiMock<'fetchAccounts'>>() }));

vi.mock('../../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/api-client')>()),
  apiClient: api,
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'alice', email: 'alice@example.test', name: 'Alice' }, loading: false, logout: vi.fn<() => Promise<void>>() }),
}));

import { AppShell } from './AppShell';
import { HELP_NAV, MAIN_NAV, NAV_GROUPS, ROUTE_TITLES, routeTitle } from './navigation';
import type { ApiMock } from '../../test/api-mock';

const SHELL_ROUTES = ['/', '/plan', '/previsionnel', '/foyer', '/import', '/comptes', '/revue', '/tendances', '/projets', '/dettes', '/aides', '/evenements', '/aide'];

function renderShell(path: string) {
  const value: HouseholdContextValue = { household: testHousehold, loading: false, offline: false, failed: false, reload: vi.fn<() => Promise<void>>(), setHousehold: vi.fn<() => void>() };
  render(
    <MemoryRouter initialEntries={[path]}>
      <HouseholdContext.Provider value={value}>
        <SpaceProvider>
          <OfflineQueueProvider>
            <AccountsProvider>
              <SelectedMonthProvider initialMonth="2026-11">
                <Routes>
                  <Route element={<AppShell />}>
                    {SHELL_ROUTES.map((route) => (
                      <Route key={route} path={route} element={<p>Contenu de {route}</p>} />
                    ))}
                  </Route>
                </Routes>
              </SelectedMonthProvider>
            </AccountsProvider>
          </OfflineQueueProvider>
        </SpaceProvider>
      </HouseholdContext.Provider>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const sideNav = () => screen.getByRole('navigation', { name: 'Navigation latérale' });

describe('Barre latérale (ordinateur)', () => {
  beforeEach(() => {
    api.fetchAccounts.mockReset();
    api.fetchAccounts.mockResolvedValue([]);
  });

  it('is a labelled navigation next to the bottom tab bar, which stays on mobile and tablet', () => {
    renderShell('/');
    expect(sideNav()).toBeInTheDocument();
    const tabBar = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(tabBar.className).toContain('lg:hidden');
    expect(sideNav().closest('aside')?.className).toMatch(/hidden .*lg:flex/);
  });

  it('shows the application and household names on top', () => {
    renderShell('/');
    const aside = sideNav().closest('aside') as HTMLElement;
    expect(within(aside).getByText('Foyer Budget')).toBeInTheDocument();
    expect(within(aside).getByText('Famille')).toBeInTheDocument();
  });

  it('lists the four main screens, then the secondary screens in readable groups, then the help', () => {
    renderShell('/');
    const nav = sideNav();
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Accueil',
      'Plan',
      'Prévisionnel',
      'Foyer',
      'Importer un relevé',
      'Comptes',
      'Revue du mois',
      'Tendances',
      'Projets',
      'Crédits',
      'Aides officielles',
      'Événements de vie',
      'Aide et documentation',
    ]);
    expect(within(nav).getByRole('list', { name: 'Suivi' })).toBeInTheDocument();
    expect(within(nav).getByRole('list', { name: 'Épargne et dettes' })).toBeInTheDocument();
    expect(within(nav).getByRole('list', { name: 'Démarches' })).toBeInTheDocument();
    expect(within(within(nav).getByRole('list', { name: 'Suivi' })).getAllByRole('link')).toHaveLength(4);
    expect(within(within(nav).getByRole('list', { name: 'Épargne et dettes' })).getAllByRole('link')).toHaveLength(2);
    expect(within(within(nav).getByRole('list', { name: 'Démarches' })).getAllByRole('link')).toHaveLength(2);
  });

  it.each(SHELL_ROUTES)('highlights its own entry (and only that one) on %s', (route) => {
    renderShell(route);
    const current = within(sideNav()).getAllByRole('link', { current: 'page' });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('href', route);
    expect(current[0].className).toContain('bg-ink');
    for (const other of within(sideNav()).getAllByRole('link').filter((link) => link !== current[0])) {
      expect(other).not.toHaveAttribute('aria-current');
      expect(other.className).not.toContain('bg-ink');
    }
  });

  it('keeps the bottom tab bar behaviour for secondary screens (« Accueil » stays highlighted on /comptes)', () => {
    renderShell('/comptes');
    const tabBar = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(within(tabBar).getByRole('link', { name: 'Accueil' }).className).toContain('text-ink');
    expect(within(sideNav()).getByRole('link', { name: 'Comptes' })).toHaveAttribute('aria-current', 'page');
    expect(within(sideNav()).getByRole('link', { name: 'Accueil' })).not.toHaveAttribute('aria-current');
  });

  it('starts with a « Aller au contenu » skip link that targets the main area', () => {
    renderShell('/');
    const skip = screen.getByRole('link', { name: 'Aller au contenu' });
    expect(skip).toHaveAttribute('href', '#contenu-principal');
    expect(skip.className).toContain('sr-only');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'contenu-principal');
    expect(skip.compareDocumentPosition(sideNav()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('moves between screens with the keyboard (focusable links, Enter follows the link)', async () => {
    const user = renderShell('/');
    const plan = within(sideNav()).getByRole('link', { name: 'Plan' });
    plan.focus();
    expect(plan).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Contenu de /plan')).toBeInTheDocument();
    expect(within(sideNav()).getByRole('link', { name: 'Plan' })).toHaveAttribute('aria-current', 'page');
  });

  it('has a visible hover state and a pointer cursor on every entry', () => {
    renderShell('/');
    for (const link of within(sideNav()).getAllByRole('link')) {
      expect(link.className).toContain('cursor-pointer');
      expect(link.className).toMatch(/hover:bg-soft-cloud|bg-ink/);
      expect(link.className).toContain('min-h-[44px]');
    }
  });
});

describe('Titre (h1) de l’en-tête de page', () => {
  beforeEach(() => {
    api.fetchAccounts.mockReset();
    api.fetchAccounts.mockResolvedValue([]);
  });

  it.each([
    ['/', 'Accueil'],
    ['/plan', 'Plan'],
    ['/previsionnel', 'Prévisionnel'],
    ['/import', 'Importer un relevé'],
    ['/comptes', 'Comptes'],
    ['/revue', 'Revue du mois'],
    ['/tendances', 'Tendances'],
    ['/projets', 'Projets'],
    ['/dettes', 'Crédits'],
  ])('titles %s « %s » for the desktop header, hidden on mobile where the page carries its own title', (route, title) => {
    renderShell(route);
    const heading = screen.getByRole('heading', { level: 1, name: title });
    expect(heading.className).toMatch(/hidden .*lg:block/);
  });

  it.each([
    ['/foyer', 'Foyer'],
    ['/aide', 'Aide et documentation'],
  ])('keeps a single h1 on %s, the same on every size', (route, title) => {
    renderShell(route);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
  });

  it.each([
    ['/aides', 'Aides officielles'],
    ['/evenements', 'Événements de vie'],
  ])('shows « Foyer » on mobile and « %s » on desktop for %s', (route, title) => {
    renderShell(route);
    expect(screen.getByRole('heading', { level: 1, name: 'Foyer' }).className).toContain('lg:hidden');
    expect(screen.getByRole('heading', { level: 1, name: title }).className).toContain('lg:block');
  });
});

describe('navigation (configuration)', () => {
  it('only points to screens that exist in the application', () => {
    const destinations = [...MAIN_NAV, ...NAV_GROUPS.flatMap((group) => group.items), HELP_NAV].map((item) => item.to);
    for (const destination of destinations) {
      expect(APP_ROUTES as readonly string[]).toContain(destination);
    }
    expect(new Set(destinations).size).toBe(destinations.length);
  });

  it('gives every screen a title and falls back to « Foyer »', () => {
    expect(Object.keys(ROUTE_TITLES)).toHaveLength(13);
    expect(routeTitle('/dettes')).toBe('Crédits');
    expect(routeTitle('/dettes/')).toBe('Crédits');
    expect(routeTitle('/inconnue')).toBe('Foyer');
  });
});
