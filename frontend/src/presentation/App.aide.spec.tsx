import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lifeEventCatalog } from '../test/fixtures';
import { testHousehold } from '../test/render-app';

const api = vi.hoisted(() => ({
  fetchHousehold: vi.fn(),
  fetchAccounts: vi.fn(),
  fetchAidRules: vi.fn(),
  fetchLifeEventCatalog: vi.fn(),
}));

vi.mock('../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/api-client')>()),
  apiClient: api,
}));

vi.mock('./auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'alice', email: 'alice@example.test', name: 'Alice' }, loading: false, logout: vi.fn() }),
}));

import App from './App';

const renderApp = (path = '/aide') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

describe('App : route /aide', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchHousehold.mockResolvedValue(testHousehold);
    api.fetchAccounts.mockResolvedValue([]);
    api.fetchAidRules.mockResolvedValue([]);
    api.fetchLifeEventCatalog.mockResolvedValue(lifeEventCatalog());
  });

  it('shows the help inside the application for a member of a household, with the tab bar and « Foyer » highlighted', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { level: 1, name: 'Aide et documentation' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Sommaire' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(within(nav).getAllByRole('link')).toHaveLength(4);
    expect(within(nav).getByRole('link', { name: 'Foyer' }).className).toContain('text-ink');
    expect(screen.getByRole('link', { name: 'Ouvrir les projets' })).toHaveAttribute('href', '/projets');
  });

  it('shows the same help, without the tab bar, for someone who has no household yet', async () => {
    api.fetchHousehold.mockResolvedValue(null);
    renderApp();
    expect(await screen.findByRole('heading', { level: 1, name: 'Aide et documentation' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Sommaire' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Navigation principale' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Ouvrir/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bienvenue' })).toHaveAttribute('href', '/bienvenue');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('still shows the help when the household cannot be loaded at all (embedded content, no network needed)', async () => {
    api.fetchHousehold.mockRejectedValue(new Error('boom'));
    renderApp();
    expect(await screen.findByRole('heading', { level: 1, name: 'Aide et documentation' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Pour commencer' })).toBeInTheDocument());
  });

  it('leaves the other routes alone: /aides is still the official aids page', async () => {
    api.fetchHousehold.mockResolvedValue(null);
    renderApp('/aides');
    await waitFor(() => expect(screen.getByText(/Commençons par votre foyer/)).toBeInTheDocument());
  });
});
