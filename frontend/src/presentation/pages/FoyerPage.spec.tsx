import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HouseholdContext, HouseholdContextValue } from '../../application/use-household';
import { Contribution, Household } from '../../domain/household';

const api = vi.hoisted(() => ({
  fetchContribution: vi.fn(),
  updateMyIncome: vi.fn(),
  updateContributionMode: vi.fn(),
  createInvitation: vi.fn(),
}));

vi.mock('../../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/api-client')>()),
  apiClient: api,
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'alice', email: 'alice@example.test', name: 'Alice' }, loading: false, logout: vi.fn() }),
}));

import { FoyerPage } from './FoyerPage';

const household: Household = {
  id: 'h1',
  name: 'Famille',
  role: 'OWNER',
  contributionMode: 'PROPORTIONAL',
  members: [
    { userId: 'alice', name: 'Alice', role: 'OWNER', netMonthlyIncomeCents: 350000 },
    { userId: 'bob', name: 'Bob', role: 'MEMBER', netMonthlyIncomeCents: 200000 },
  ],
  spaces: [
    { id: 's-common', kind: 'COMMON', name: 'Commun' },
    { id: 's-alice', kind: 'PERSONAL', name: 'Perso' },
  ],
};

const complete: Contribution = {
  mode: 'PROPORTIONAL',
  commonNeedCents: 330000,
  incomplete: false,
  shortfallCents: 0,
  shares: [
    { userId: 'alice', name: 'Alice', incomeCents: 350000, contributionCents: 210000, remainingCents: 140000 },
    { userId: 'bob', name: 'Bob', incomeCents: 200000, contributionCents: 120000, remainingCents: 80000 },
  ],
};

const shareLines = () =>
  screen
    .queryAllByRole('listitem')
    .map((item) => item.textContent ?? '')
    .filter((text) => /verse .* il lui reste/.test(text));

function renderPage(overrides: Partial<Household> = {}) {
  const reload = vi.fn().mockResolvedValue(undefined);
  const value: HouseholdContextValue = {
    household: { ...household, ...overrides },
    loading: false,
    offline: false,
    failed: false,
    reload,
    setHousehold: vi.fn(),
  };
  render(
    <MemoryRouter>
      <HouseholdContext.Provider value={value}>
        <FoyerPage />
      </HouseholdContext.Provider>
    </MemoryRouter>,
  );
  return { reload, user: userEvent.setup() };
}

describe('FoyerPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchContribution.mockResolvedValue(complete);
    api.updateMyIncome.mockResolvedValue(undefined);
    api.updateContributionMode.mockResolvedValue(undefined);
  });

  it('lists the members with their income', () => {
    renderPage();
    expect(screen.getByText('(vous)')).toBeInTheDocument();
    expect(screen.getByText(/3\s?500,00/)).toBeInTheDocument();
  });

  it('previews what each member pays and keeps', async () => {
    renderPage();
    await waitFor(() => expect(shareLines()).toHaveLength(2));
    const text = shareLines().join('|');
    expect(text).toMatch(/Alice verse 2\s?100,00\s€, il lui reste 1\s?400,00\s€/);
    expect(text).toMatch(/Bob verse 1\s?200,00\s€, il lui reste 800,00\s€/);
  });

  it('asks for the missing incomes when the contribution is incomplete', async () => {
    api.fetchContribution.mockResolvedValue({ ...complete, incomplete: true, shares: [] });
    renderPage({
      members: [
        { userId: 'alice', name: 'Alice', role: 'OWNER', netMonthlyIncomeCents: 350000 },
        { userId: 'bob', name: 'Bob', role: 'MEMBER', netMonthlyIncomeCents: null },
      ],
    });
    expect(await screen.findByText('Il manque des revenus pour calculer les parts.')).toBeInTheDocument();
    expect(screen.getByText(/manquant : Bob/)).toBeInTheDocument();
    expect(shareLines()).toEqual([]);
  });

  it('warns when the incomes do not cover the common budget', async () => {
    api.fetchContribution.mockResolvedValue({ ...complete, shortfallCents: 25000 });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(/il manque\s+250,00\s€ par mois/);
  });

  it('saves my income in cents and refreshes the household', async () => {
    const { user, reload } = renderPage();
    const input = screen.getByLabelText('Revenu net mensuel');
    await user.clear(input);
    await user.type(input, '2 000,50');
    await user.click(screen.getByRole('button', { name: 'Enregistrer mon revenu' }));
    await waitFor(() => expect(api.updateMyIncome).toHaveBeenCalledWith(200050));
    expect(reload).toHaveBeenCalled();
  });

  it('rejects an invalid income', async () => {
    const { user } = renderPage();
    const input = screen.getByLabelText('Revenu net mensuel');
    await user.clear(input);
    await user.type(input, 'beaucoup');
    await user.click(screen.getByRole('button', { name: 'Enregistrer mon revenu' }));
    expect(screen.getByText(/Revenu invalide/)).toBeInTheDocument();
    expect(api.updateMyIncome).not.toHaveBeenCalled();
  });

  it('changes the contribution rule and recomputes the preview', async () => {
    const { user } = renderPage();
    await waitFor(() => expect(shareLines()).toHaveLength(2));
    await user.click(screen.getByRole('radio', { name: /Moitié-moitié/ }));
    await waitFor(() => expect(api.updateContributionMode).toHaveBeenCalledWith('EQUAL'));
    await waitFor(() => expect(api.fetchContribution).toHaveBeenCalledTimes(2));
  });

  it('shows the invitation code with a copy button', async () => {
    api.createInvitation.mockResolvedValue({ code: 'ABCD-1234', expiresAt: '2026-11-06T10:00:00.000Z' });
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Inviter quelqu’un' }));
    expect(await screen.findByTestId('invitation-code')).toHaveTextContent('ABCD-1234');
    expect(screen.getByRole('button', { name: 'Copier' })).toBeInTheDocument();
  });
});
