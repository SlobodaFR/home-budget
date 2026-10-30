import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HouseholdContext, HouseholdContextValue } from '../../application/use-household';
import { SpaceProvider } from '../../application/use-space';
import { testHousehold } from '../../test/render-app';

const api = vi.hoisted(() => ({
  fetchContribution: vi.fn(),
  fetchSafetyNet: vi.fn(),
  fetchContributionStatus: vi.fn(),
}));

vi.mock('../../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/api-client')>()),
  apiClient: api,
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'alice', email: 'alice@example.test', name: 'Alice' }, loading: false, logout: vi.fn() }),
}));

import { FoyerPage } from './FoyerPage';

function renderPage(offline = false) {
  const value: HouseholdContextValue = { household: testHousehold, loading: false, offline, failed: false, reload: vi.fn(), setHousehold: vi.fn() };
  render(
    <MemoryRouter>
      <HouseholdContext.Provider value={value}>
        <SpaceProvider>
          <FoyerPage />
        </SpaceProvider>
      </HouseholdContext.Provider>
    </MemoryRouter>,
  );
}

describe('FoyerPage : aide et documentation', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchContribution.mockResolvedValue({ mode: 'EQUAL', commonNeedCents: 0, incomplete: true, shortfallCents: 0, shares: [] });
    api.fetchSafetyNet.mockResolvedValue({ safetyNet: null, progress: null });
    api.fetchContributionStatus.mockResolvedValue({ month: '2026-11', incomplete: true, members: [], totalExpectedCents: null, totalPaidCents: 0 });
  });

  it('has a section that links to the help screen', () => {
    renderPage();
    const heading = screen.getByRole('heading', { name: 'Aide et documentation' });
    const section = heading.closest('section') as HTMLElement;
    expect(section).toHaveTextContent('Lisible même sans réseau');
    expect(screen.getByRole('link', { name: 'Ouvrir l’aide' })).toHaveAttribute('href', '/aide');
  });

  it('keeps the link when the page itself needs a connection: the help is embedded and works offline', () => {
    renderPage(true);
    expect(screen.getByText(/Cette page a besoin d’une connexion/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Aide et documentation' })).toHaveAttribute('href', '/aide');
  });
});
