import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HouseholdContext, HouseholdContextValue } from '../../application/use-household';
import { SpaceProvider } from '../../application/use-space';
import { ContributionReport, parseContributionReport } from '../../domain/contribution-tracking';
import { Household } from '../../domain/household';
import { ApiError, NetworkError } from '../../infrastructure/api-client';
import { preferences } from '../../infrastructure/local-store';
import { account } from '../../test/fixtures';
import { ToastProvider } from '../components/Toast';

const api = vi.hoisted(() => ({
  fetchContribution: vi.fn(),
  fetchSafetyNet: vi.fn(),
  fetchContributionStatus: vi.fn(),
  createContributionPayment: vi.fn(),
  fetchAccounts: vi.fn(),
}));

vi.mock('../../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/api-client')>()),
  apiClient: api,
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'alice', email: 'alice@example.test', name: 'Alice' }, loading: false, logout: vi.fn() }),
}));

import { FoyerPage } from './FoyerPage';

const plain = (value: string | null | undefined) => (value ?? '').replace(/[\s  ]/g, ' ');

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

const report = (overrides: Partial<Record<string, unknown>> = {}): ContributionReport =>
  parseContributionReport(
    {
      month: '2026-11',
      incomplete: false,
      members: [
        { userId: 'alice', name: 'Alice', expectedCents: 175000, paidCents: 120000, remainingCents: 55000, status: 'PARTIAL', isMe: true },
        { userId: 'bob', name: 'Bob', expectedCents: 175000, paidCents: 175000, remainingCents: 0, status: 'PAID', isMe: false },
      ],
      totalExpectedCents: 350000,
      totalPaidCents: 295000,
      ...overrides,
    },
    '2026-11',
  );

function renderPage({ entry = '/foyer', value = household }: { entry?: string; value?: Household } = {}) {
  preferences.setSpaceKind('COMMON');
  const context: HouseholdContextValue = { household: value, loading: false, offline: false, failed: false, reload: vi.fn(), setHousehold: vi.fn() };
  render(
    <MemoryRouter initialEntries={[entry]}>
      <HouseholdContext.Provider value={context}>
        <SpaceProvider>
          <ToastProvider>
            <FoyerPage />
          </ToastProvider>
        </SpaceProvider>
      </HouseholdContext.Provider>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const card = () => screen.findByRole('region', { name: 'Contributions du mois' });
const openSheet = async (user: ReturnType<typeof userEvent.setup>) => {
  await card();
  await user.click(await screen.findByRole('button', { name: 'J’ai versé ma contribution' }));
  return screen.findByRole('dialog', { name: 'Verser ma contribution' });
};

describe('FoyerPage « Contributions du mois »', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 15, 12, 0, 0));
    api.fetchContribution.mockResolvedValue({ mode: 'PROPORTIONAL', commonNeedCents: 0, incomplete: true, shortfallCents: 0, shares: [] });
    api.fetchSafetyNet.mockResolvedValue({ safetyNet: null, progress: null });
    api.fetchContributionStatus.mockImplementation(async (month: string) => report({ month }));
    api.createContributionPayment.mockResolvedValue({ transactionId: 't1', personalTransactionId: null });
    api.fetchAccounts.mockResolvedValue([]);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('status', () => {
    it('loads the current month and shows one block per member, mine highlighted', async () => {
      renderPage();
      const section = await card();
      await within(section).findAllByTestId('contribution-member');
      expect(api.fetchContributionStatus).toHaveBeenCalledWith('2026-11');
      const members = within(section).getAllByTestId('contribution-member');
      expect(members).toHaveLength(2);
      expect(members[0]).toHaveAttribute('data-me', 'true');
      expect(members[0]).toHaveTextContent('Alice(vous)');
      expect(members[1]).not.toHaveAttribute('data-me');
      expect(members[1]).not.toHaveTextContent('(vous)');
    });

    it('shows expected, paid and remaining, the status in words and a progress bar with text', async () => {
      renderPage();
      const [mine, other] = await within(await card()).findAllByTestId('contribution-member');
      const text = plain(mine.textContent);
      expect(text).toContain('Attendu');
      expect(text).toContain('1 750 €');
      expect(text).toContain('Versé');
      expect(text).toContain('1 200 €');
      expect(text).toContain('Reste');
      expect(text).toContain('550 €');
      expect(within(mine).getByText('Versé en partie')).toBeInTheDocument();
      expect(text).toContain('Il reste 550 € à verser.');
      const bar = within(mine).getByRole('progressbar', { name: 'Contribution de Alice' });
      expect(bar).toHaveAttribute('aria-valuenow', '68');
      expect(plain(bar.getAttribute('aria-valuetext'))).toBe('1 200 € versés sur 1 750 € attendus');
      expect(within(other).getByText('Versé', { selector: 'span' })).toBeInTheDocument();
      expect(plain(other.textContent)).toContain('Contribution versée, merci !');
      expect(within(other).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    });

    it('shows the totals', async () => {
      renderPage();
      await within(await card()).findAllByTestId('contribution-member');
      expect(plain(screen.getByTestId('contribution-totals').textContent)).toBe('Total versé : 2 950 € sur 3 500 € attendus');
    });

    it('writes every status in words, with an icon', async () => {
      api.fetchContributionStatus.mockResolvedValue(
        report({
          members: [
            { userId: 'alice', name: 'Alice', expectedCents: 100000, paidCents: 0, status: 'PENDING', isMe: true },
            { userId: 'bob', name: 'Bob', expectedCents: 100000, paidCents: 150000, status: 'OVERPAID' },
            { userId: 'carl', name: 'Carl', expectedCents: 0, paidCents: 0, status: 'NONE' },
          ],
        }),
      );
      renderPage();
      const members = await within(await card()).findAllByTestId('contribution-member');
      expect(within(members[0]).getByText('À verser').closest('span')?.querySelector('svg')).not.toBeNull();
      expect(plain(members[0].textContent)).toContain('Rien n’a encore été versé : il reste 1 000 € à verser.');
      expect(within(members[1]).getByText('Versé en plus')).toBeInTheDocument();
      expect(plain(members[1].textContent)).toContain('Vous avez versé 500 € de plus que prévu.');
      expect(within(members[2]).getByText('Rien à verser')).toBeInTheDocument();
      expect(within(members[2]).queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('explains an incomplete month, links to the income form and shows unknown amounts as dashes', async () => {
      api.fetchContributionStatus.mockResolvedValue(
        report({
          incomplete: true,
          totalExpectedCents: null,
          totalPaidCents: 50000,
          members: [
            { userId: 'alice', name: 'Alice', expectedCents: null, paidCents: 50000, remainingCents: null, status: 'UNKNOWN', isMe: true },
            { userId: 'bob', name: 'Bob', expectedCents: null, paidCents: 0, remainingCents: null, status: 'UNKNOWN' },
          ],
        }),
      );
      renderPage();
      const section = await card();
      const note = await within(section).findByRole('note', { name: 'Revenus manquants' });
      expect(note).toHaveTextContent('Il manque des revenus pour calculer la contribution de chacun');
      expect(within(note).getByRole('link', { name: 'Renseigner mon revenu' })).toHaveAttribute('href', '#mon-revenu');
      expect(document.getElementById('mon-revenu')).not.toBeNull();
      const [mine] = within(section).getAllByTestId('contribution-member');
      expect(within(mine).getByText('À calculer')).toBeInTheDocument();
      expect(within(mine).getAllByText('—')).toHaveLength(2);
      expect(within(mine).queryByRole('progressbar')).not.toBeInTheDocument();
      expect(plain(screen.getByTestId('contribution-totals').textContent)).toBe('Total versé : 500 €');
    });

    it('changes month, up to next month but no further', async () => {
      const user = renderPage();
      const section = await card();
      await within(section).findAllByTestId('contribution-member');
      await user.click(within(section).getByRole('button', { name: 'Mois précédent' }));
      await waitFor(() => expect(api.fetchContributionStatus).toHaveBeenLastCalledWith('2026-10'));
      await user.click(within(section).getByRole('button', { name: 'Mois suivant' }));
      await user.click(within(section).getByRole('button', { name: 'Mois suivant' }));
      await waitFor(() => expect(api.fetchContributionStatus).toHaveBeenLastCalledWith('2026-12'));
      expect(within(section).getByRole('button', { name: 'Mois suivant' })).toBeDisabled();
    });

    it('offers a retry when loading fails', async () => {
      api.fetchContributionStatus.mockRejectedValueOnce(new ApiError(500, 'boom')).mockImplementation(async (month: string) => report({ month }));
      const user = renderPage();
      const section = await card();
      expect(await within(section).findByRole('alert')).toHaveTextContent('Impossible de charger les contributions du mois');
      await user.click(within(section).getByRole('button', { name: 'Réessayer' }));
      expect(await within(section).findAllByTestId('contribution-member')).toHaveLength(2);
    });

    it('reports being offline', async () => {
      api.fetchContributionStatus.mockRejectedValue(new NetworkError());
      renderPage();
      expect(await screen.findByText(/Hors ligne : le suivi des contributions reviendra avec le réseau/)).toBeInTheDocument();
    });
  });

  describe('paying', () => {
    it('opens a sheet with the remaining amount prefilled, today’s date and no personal debit', async () => {
      const user = renderPage();
      const dialog = await openSheet(user);
      expect(within(dialog).getByLabelText('Montant versé')).toHaveValue('550');
      expect(within(dialog).getByLabelText('Date du versement')).toHaveValue('2026-11-15');
      expect(within(dialog).getByLabelText('Retirer aussi de mon espace perso')).not.toBeChecked();
      expect(within(dialog).queryByRole('group', { name: 'Bloc de la dépense perso' })).not.toBeInTheDocument();
      expect(within(dialog).queryByLabelText(/Compte de l’espace commun/)).not.toBeInTheDocument();
      expect(dialog).toHaveTextContent('Il vous reste 550 € à verser.');
    });

    it('records the payment for the displayed month, then refreshes the status and confirms', async () => {
      const user = renderPage();
      const dialog = await openSheet(user);
      await user.clear(within(dialog).getByLabelText('Montant versé'));
      await user.type(within(dialog).getByLabelText('Montant versé'), '500,50');
      fireEvent.change(within(dialog).getByLabelText('Date du versement'), { target: { value: '2026-11-03' } });
      await user.click(within(dialog).getByRole('button', { name: 'Enregistrer mon versement' }));
      await waitFor(() => expect(api.createContributionPayment).toHaveBeenCalledWith({ month: '2026-11', amountCents: 50050, date: '2026-11-03' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await waitFor(() => expect(api.fetchContributionStatus).toHaveBeenCalledTimes(2));
      expect(await screen.findByText(/Contribution enregistrée : 500,50 € le 3 novembre 2026/)).toBeInTheDocument();
    });

    it('pays for the month chosen in the picker', async () => {
      const user = renderPage();
      const section = await card();
      await within(section).findAllByTestId('contribution-member');
      await user.click(within(section).getByRole('button', { name: 'Mois précédent' }));
      await waitFor(() => expect(api.fetchContributionStatus).toHaveBeenLastCalledWith('2026-10'));
      await user.click(await screen.findByRole('button', { name: 'J’ai versé ma contribution' }));
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent('octobre 2026');
      await user.click(within(dialog).getByRole('button', { name: 'Enregistrer mon versement' }));
      await waitFor(() => expect(api.createContributionPayment).toHaveBeenCalledWith(expect.objectContaining({ month: '2026-10' })));
    });

    it('offers the accounts of the common space and sends the chosen one', async () => {
      api.fetchAccounts.mockImplementation(async (spaceId: string) =>
        spaceId === 's-common' ? [account({ id: 'c1', name: 'Compte commun' }), account({ id: 'c2', name: 'Livret A', kind: 'SAVINGS' })] : [account({ id: 'p1', spaceId: 's-alice', name: 'Mon courant' })],
      );
      const user = renderPage();
      const dialog = await openSheet(user);
      const select = await within(dialog).findByLabelText('Compte de l’espace commun (facultatif)');
      expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual(['Aucun', 'Compte commun', 'Livret A']);
      expect(select).toHaveValue('');
      await user.selectOptions(select, 'c2');
      await user.click(within(dialog).getByRole('button', { name: 'Enregistrer mon versement' }));
      await waitFor(() => expect(api.createContributionPayment).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'c2' })));
      expect(api.createContributionPayment.mock.calls[0][0]).not.toHaveProperty('debitPersonal');
    });

    it('reveals the bloc (Fixe by default) and the personal account when the box is checked, and sends them', async () => {
      api.fetchAccounts.mockImplementation(async (spaceId: string) => (spaceId === 's-alice' ? [account({ id: 'p1', spaceId: 's-alice', name: 'Mon courant' })] : []));
      const user = renderPage();
      const dialog = await openSheet(user);
      await user.click(within(dialog).getByLabelText('Retirer aussi de mon espace perso'));
      const group = within(dialog).getByRole('group', { name: 'Bloc de la dépense perso' });
      expect(within(group).getByRole('button', { name: 'Fixe' })).toHaveAttribute('aria-pressed', 'true');
      expect(within(group).getByRole('button', { name: 'Courant' })).toHaveAttribute('aria-pressed', 'false');
      expect(dialog).toHaveTextContent('visible par vous seul');
      await user.click(within(group).getByRole('button', { name: 'Courant' }));
      await user.selectOptions(await within(dialog).findByLabelText('Compte de mon espace perso (facultatif)'), 'p1');
      await user.click(within(dialog).getByRole('button', { name: 'Enregistrer mon versement' }));
      await waitFor(() =>
        expect(api.createContributionPayment).toHaveBeenCalledWith({ month: '2026-11', amountCents: 55000, date: '2026-11-15', debitPersonal: true, personalBloc: 'COURANT', personalAccountId: 'p1' }),
      );
    });

    it('does not send the personal fields once the box is unchecked again', async () => {
      const user = renderPage();
      const dialog = await openSheet(user);
      await user.click(within(dialog).getByLabelText('Retirer aussi de mon espace perso'));
      await user.click(within(dialog).getByRole('button', { name: 'Plaisir' }));
      await user.click(within(dialog).getByLabelText('Retirer aussi de mon espace perso'));
      expect(within(dialog).queryByRole('group', { name: 'Bloc de la dépense perso' })).not.toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Enregistrer mon versement' }));
      await waitFor(() => expect(api.createContributionPayment).toHaveBeenCalledTimes(1));
      expect(api.createContributionPayment.mock.calls[0][0]).toEqual({ month: '2026-11', amountCents: 55000, date: '2026-11-15' });
    });

    it('does not offer the personal debit without a personal space', async () => {
      const user = renderPage({ value: { ...household, spaces: [household.spaces[0]] } });
      const dialog = await openSheet(user);
      expect(within(dialog).queryByLabelText('Retirer aussi de mon espace perso')).not.toBeInTheDocument();
    });

    it('validates in French before calling the API', async () => {
      const user = renderPage();
      const dialog = await openSheet(user);
      await user.clear(within(dialog).getByLabelText('Montant versé'));
      fireEvent.change(within(dialog).getByLabelText('Date du versement'), { target: { value: '' } });
      await user.click(within(dialog).getByRole('button', { name: 'Enregistrer mon versement' }));
      expect(within(dialog).getByText('Indiquez le montant que vous avez versé.')).toBeInTheDocument();
      expect(within(dialog).getByText('Choisissez la date du versement.')).toBeInTheDocument();
      expect(within(dialog).getByLabelText('Montant versé')).toHaveAttribute('aria-invalid', 'true');
      expect(api.createContributionPayment).not.toHaveBeenCalled();
    });

    it('shows a readable message for a 400 and keeps everything typed', async () => {
      api.createContributionPayment.mockRejectedValue(new ApiError(400, 'invalide'));
      const user = renderPage();
      const dialog = await openSheet(user);
      await user.clear(within(dialog).getByLabelText('Montant versé'));
      await user.type(within(dialog).getByLabelText('Montant versé'), '123');
      await user.click(within(dialog).getByRole('button', { name: 'Enregistrer mon versement' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ce versement n’a pas été accepté');
      expect(within(dialog).getByRole('alert')).toHaveTextContent('Rien n’a été enregistré');
      expect(within(dialog).getByLabelText('Montant versé')).toHaveValue('123');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('says clearly that nothing is queued when the network fails, and lets you retry', async () => {
      api.createContributionPayment.mockRejectedValueOnce(new NetworkError());
      const user = renderPage();
      const dialog = await openSheet(user);
      await user.click(within(dialog).getByRole('button', { name: 'Enregistrer mon versement' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('pas mis en attente');
      expect(within(dialog).getByLabelText('Montant versé')).toHaveValue('550');
      await user.click(within(dialog).getByRole('button', { name: 'Enregistrer mon versement' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(api.createContributionPayment).toHaveBeenCalledTimes(2);
    });

    it('warns in advance when the browser knows it is offline', async () => {
      vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
      const user = renderPage();
      const dialog = await openSheet(user);
      expect(within(dialog).getByRole('status')).toHaveTextContent('Un versement ne peut pas être mis en attente');
    });

    it('sends only one request when the button is pressed twice', async () => {
      let release: (value: unknown) => void = () => undefined;
      api.createContributionPayment.mockReturnValue(new Promise((resolve) => (release = resolve)));
      const user = renderPage();
      const dialog = await openSheet(user);
      await user.click(within(dialog).getByRole('button', { name: 'Enregistrer mon versement' }));
      await user.click(await within(dialog).findByRole('button', { name: 'Enregistrement…' }));
      expect(api.createContributionPayment).toHaveBeenCalledTimes(1);
      release({ transactionId: 't', personalTransactionId: null });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
  });

  describe('arriving from the « Verser ma contribution » insight', () => {
    it('opens the payment sheet when something is left to pay, and clears the parameter so it does not reopen', async () => {
      renderPage({ entry: '/foyer?verser=1' });
      const dialog = await screen.findByRole('dialog', { name: 'Verser ma contribution' });
      expect(within(dialog).getByLabelText('Montant versé')).toHaveValue('550');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Fermer' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('only shows the card when my contribution is already paid', async () => {
      api.fetchContributionStatus.mockResolvedValue(
        report({ members: [{ userId: 'alice', name: 'Alice', expectedCents: 100000, paidCents: 100000, status: 'PAID', isMe: true }] }),
      );
      renderPage({ entry: '/foyer?verser=1' });
      await within(await card()).findAllByTestId('contribution-member');
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not open anything without the parameter', async () => {
      renderPage();
      await within(await card()).findAllByTestId('contribution-member');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
