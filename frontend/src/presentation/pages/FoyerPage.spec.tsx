import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  fetchSafetyNet: vi.fn(),
  saveSafetyNet: vi.fn(),
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
    api.fetchSafetyNet.mockResolvedValue({ safetyNet: null, progress: null });
    api.saveSafetyNet.mockResolvedValue(undefined);
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

  describe('safety net', () => {
    it('saves the amount in cents, the date and the target in months', async () => {
      const { user } = renderPage();
      const amount = await screen.findByLabelText('Montant épargné');
      await user.type(amount, '5 500,50');
      fireEvent.change(screen.getByLabelText('À la date du'), { target: { value: '2026-11-01' } });
      const months = screen.getByLabelText('Objectif en mois de dépenses');
      await user.clear(months);
      await user.type(months, '6');
      await user.click(screen.getByRole('button', { name: 'Enregistrer l’épargne' }));
      await waitFor(() =>
        expect(api.saveSafetyNet).toHaveBeenCalledWith({ savedCents: 550050, asOf: '2026-11-01', targetMonths: 6 }),
      );
      await waitFor(() => expect(api.fetchSafetyNet).toHaveBeenCalledTimes(2));
    });

    it('refuses an out-of-range target without calling the API', async () => {
      const { user } = renderPage();
      await user.type(await screen.findByLabelText('Montant épargné'), '1000');
      const months = screen.getByLabelText('Objectif en mois de dépenses');
      await user.clear(months);
      await user.type(months, '30');
      await user.click(screen.getByRole('button', { name: 'Enregistrer l’épargne' }));
      expect(await screen.findByText(/entre 1 et 24/)).toBeInTheDocument();
      expect(api.saveSafetyNet).not.toHaveBeenCalled();
    });

    it('shows the server-computed progress and keeps the form on the raw declared amount', async () => {
      api.fetchSafetyNet.mockResolvedValue({
        safetyNet: { savedCents: 550000, asOf: '2026-11-01', targetMonths: 6 },
        progress: { currentCents: 600000, monthlyBasisCents: 300000, coveredMonths: 2 },
      });
      renderPage();
      const progress = await screen.findByTestId('safety-net-progress');
      expect(progress).toHaveTextContent(/6\s?000,00\s€/);
      expect(progress).toHaveTextContent(/dont 500,00\s€ versés depuis le 1 novembre 2026/);
      expect(progress).toHaveTextContent(/2 mois de dépenses couverts sur 6 visés/);
      expect(progress).toHaveTextContent(/3\s?000,00\s€ par mois/);
      expect(screen.getByRole('progressbar', { name: 'Épargne de sécurité' })).toHaveAttribute('aria-valuenow', '2');
      expect(screen.getByLabelText('Montant épargné')).toHaveValue('5500');
    });

    it('shows only the amount when the backend sends no progress', async () => {
      api.fetchSafetyNet.mockResolvedValue({ safetyNet: { savedCents: 550000, asOf: '2026-11-01', targetMonths: 6 }, progress: null });
      renderPage();
      const progress = await screen.findByTestId('safety-net-progress');
      expect(progress).toHaveTextContent(/5\s?500,00\s€/);
      expect(progress).toHaveTextContent(/Objectif : couvrir 6 mois de dépenses/);
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(api.fetchSafetyNet).toHaveBeenCalledTimes(1);
    });

    it('shows no coverage when the monthly basis is unknown', async () => {
      api.fetchSafetyNet.mockResolvedValue({
        safetyNet: { savedCents: 550000, asOf: '2026-11-01', targetMonths: 6 },
        progress: { currentCents: 550000, monthlyBasisCents: 0, coveredMonths: null },
      });
      renderPage();
      const progress = await screen.findByTestId('safety-net-progress');
      expect(progress).toHaveTextContent(/Renseignez le plan commun/);
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('links to the official aids page', () => {
      renderPage();
      expect(screen.getByRole('link', { name: 'Voir mes aides' })).toHaveAttribute('href', '/aides');
    });
  });
});
