import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DebtsSummary } from '../../domain/debt';
import { ApiError, NetworkError } from '../../infrastructure/api-client';
import { debt } from '../../test/fixtures';
import { renderInApp } from '../../test/render-app';

const api = vi.hoisted(() => ({
  fetchDebts: vi.fn(),
  fetchDebtsSummary: vi.fn(),
  createDebt: vi.fn(),
  updateDebt: vi.fn(),
  deleteDebt: vi.fn(),
  fetchDebtWhatIf: vi.fn(),
  fetchRecurring: vi.fn(),
  fetchAccounts: vi.fn(),
}));

vi.mock('../../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/api-client')>()),
  apiClient: api,
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'alice', email: 'alice@example.test', name: 'Alice' }, loading: false, logout: vi.fn() }),
}));

import { DettesPage } from './DettesPage';

const plain = (value: string | null | undefined) => (value ?? '').replace(/[\s  ]/g, ' ');

const car = debt();
const stuck = debt({
  id: 'd2',
  name: 'Crédit conso',
  kind: 'CONSUMER',
  principalCents: 1000000,
  remainingCents: 1000000,
  annualRatePercent: 12,
  monthlyPaymentCents: 5000,
  insuranceMonthlyCents: 0,
  monthsRemaining: null,
  payoffDate: null,
  totalInterestRemainingCents: null,
  paidSharePercent: 0,
  neverPaidOff: true,
});
const old = debt({ id: 'd3', name: 'Ancien prêt', kind: 'STUDENT', archived: true, remainingCents: 0, paidSharePercent: 100, monthsRemaining: 0, payoffDate: null, totalInterestRemainingCents: 0 });

const summary: DebtsSummary = { activeCount: 2, totalRemainingCents: 2120000, totalMonthlyCents: 38500, debtToIncomePercent: 31 };

const whatIf = {
  baseline: { monthsRemaining: 38, totalInterestRemainingCents: 96000, payoffDate: '2029-12-05' },
  scenario: { monthsRemaining: 29, totalInterestRemainingCents: 69000, payoffDate: '2029-03-05' },
  interestSavedCents: 27000,
  monthsSaved: 9,
  note: 'Vérifiez les indemnités de remboursement anticipé de votre contrat.',
};

const recurringItem = (overrides: Record<string, unknown>) => ({
  id: 'r1',
  spaceId: 's-common',
  kind: 'EXPENSE',
  bloc: 'FIXE',
  label: 'Prêt auto',
  amountCents: 32000,
  dayOfMonth: 5,
  startDate: '2024-09-01',
  endDate: null,
  active: true,
  aidRuleId: null,
  ...overrides,
});

const renderPage = (kind: 'COMMON' | 'PERSONAL' = 'COMMON') => renderInApp(<DettesPage />, { path: '/dettes', kind });

describe('DettesPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchAccounts.mockResolvedValue([]);
    api.fetchRecurring.mockResolvedValue([]);
    api.fetchDebts.mockResolvedValue([car, stuck, old]);
    api.fetchDebtsSummary.mockResolvedValue(summary);
    api.createDebt.mockResolvedValue(car);
    api.updateDebt.mockResolvedValue(undefined);
    api.deleteDebt.mockResolvedValue(undefined);
    api.fetchDebtWhatIf.mockResolvedValue(whatIf);
  });

  describe('list', () => {
    it('loads the debts of the selected space', async () => {
      renderPage();
      await screen.findByRole('list', { name: 'Crédits en cours' });
      expect(api.fetchDebts).toHaveBeenCalledWith('s-common');
      expect(api.fetchDebtsSummary).toHaveBeenCalledWith('s-common');
      expect(screen.getByRole('heading', { name: 'Crédits communs' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Accueil' })).toHaveAttribute('href', '/');
    });

    it('titles the personal space differently and loads its debts', async () => {
      renderPage('PERSONAL');
      expect(await screen.findByRole('heading', { name: 'Crédits perso' })).toBeInTheDocument();
      await waitFor(() => expect(api.fetchDebts).toHaveBeenCalledWith('s-alice'));
    });

    it('shows each debt with capital, repaid share as text and bar, monthly payment with insurance, rate, end date and interest', async () => {
      renderPage();
      const list = await screen.findByRole('list', { name: 'Crédits en cours' });
      const cards = within(list).getAllByTestId('debt-card');
      expect(cards).toHaveLength(2);
      const card = cards.find((item) => item.textContent?.includes('Prêt auto')) as HTMLElement;
      const text = plain(card.textContent);
      expect(text).toContain('Auto · Taux 3,9 %');
      expect(text).toContain('Capital restant');
      expect(text).toContain('11 200 €');
      expect(text).toContain('Déjà remboursé : 25 % — 3 800 € sur 15 000 €');
      expect(text).toContain('320 € par mois, plus 15 € d’assurance');
      expect(text).toContain('Fin prévue le 5 décembre 2029 · dans 38 mois (3 ans et 2 mois)');
      expect(text).toContain('Intérêts restant à payer : 960 €');
      const bar = within(card).getByRole('progressbar', { name: 'Remboursement de Prêt auto' });
      expect(bar).toHaveAttribute('aria-valuenow', '25');
      expect(bar).toHaveAttribute('aria-valuetext', expect.stringContaining('Déjà remboursé : 25 %'));
      expect(within(card).getByText('Auto', { selector: '.sr-only' })).toBeInTheDocument();
    });

    it('puts a debt that never goes down first and says it clearly, in words', async () => {
      renderPage();
      const list = await screen.findByRole('list', { name: 'Crédits en cours' });
      const cards = within(list).getAllByTestId('debt-card');
      expect(cards[0]).toHaveTextContent('Crédit conso');
      expect(cards[0]).toHaveAttribute('data-never-paid-off', 'true');
      expect(within(cards[0]).getByText('La dette ne diminue pas')).toBeInTheDocument();
      const alert = within(cards[0]).getByRole('alert');
      expect(alert).toHaveTextContent('Cette mensualité ne couvre pas les intérêts');
      expect(plain(alert.textContent)).toContain('environ 100 €');
      expect(plain(alert.textContent)).toContain('50 €');
      expect(cards[0]).not.toHaveTextContent('Fin prévue');
      expect(cards[0]).not.toHaveTextContent('Intérêts restant à payer');
      expect(cards[1]).not.toHaveAttribute('data-never-paid-off');
    });

    it('folds the archived debts', async () => {
      const user = renderPage();
      await screen.findByRole('list', { name: 'Crédits en cours' });
      const details = screen.getByText('Crédits archivés (1)').closest('details') as HTMLDetailsElement;
      expect(details.open).toBe(false);
      await user.click(screen.getByText('Crédits archivés (1)'));
      expect(details.open).toBe(true);
      expect(within(details).getByText('Ancien prêt')).toBeInTheDocument();
      expect(within(details).getByText('Archivé')).toBeInTheDocument();
      expect(within(details).getByText('Remboursé')).toBeInTheDocument();
    });

    it('explains an empty space and offers to add the first debt, without a summary', async () => {
      api.fetchDebts.mockResolvedValue([]);
      api.fetchDebtsSummary.mockResolvedValue({ activeCount: 0, totalRemainingCents: 0, totalMonthlyCents: 0, debtToIncomePercent: null });
      const user = renderPage();
      expect(await screen.findByText('À quoi sert le suivi des crédits ?')).toBeInTheDocument();
      expect(screen.getByText(/tableau d’amortissement ou le relevé de la banque/)).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Synthèse des crédits' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Ajouter mon premier crédit' }));
      expect(await screen.findByRole('dialog', { name: 'Nouveau crédit' })).toBeInTheDocument();
    });

    it('offers a retry when loading fails', async () => {
      api.fetchDebts.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValue([car]);
      const user = renderPage();
      expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les crédits');
      await user.click(screen.getByRole('button', { name: 'Réessayer' }));
      expect(await screen.findByRole('list', { name: 'Crédits en cours' })).toBeInTheDocument();
    });

    it('reports being offline', async () => {
      api.fetchDebts.mockRejectedValue(new NetworkError());
      renderPage();
      expect(await screen.findByText(/Hors ligne : vos crédits reviendront avec le réseau/)).toBeInTheDocument();
    });
  });

  describe('summary banner', () => {
    it('shows active count, remaining capital, total monthly payments and the debt ratio with the 35 % reference', async () => {
      renderPage();
      const banner = await screen.findByRole('region', { name: 'Synthèse des crédits' });
      const text = plain(banner.textContent);
      expect(text).toContain('Crédits en cours');
      expect(text).toContain('Capital restant');
      expect(text).toContain('21 200 €');
      expect(text).toContain('Mensualités totales');
      expect(text).toContain('385 €');
      expect(text).toContain('assurances comprises');
      expect(text).toContain('Taux d’endettement');
      expect(text).toContain('31 %');
      expect(within(banner).getByText('Sous le repère')).toBeInTheDocument();
      expect(within(banner).getByTestId('ratio-text')).toHaveTextContent('31 % de vos revenus partent en mensualités : c’est sous le repère courant de 35 %.');
      expect(banner).toHaveTextContent('pas une règle de droit');
      expect(within(banner).getByRole('progressbar', { name: 'Taux d’endettement' })).toHaveAttribute('aria-valuetext', '31 % ; repère courant : 35 %');
      expect(within(banner).getByTestId('ratio-marker')).toBeInTheDocument();
    });

    it('says in words and in red that the ratio is above the reference', async () => {
      api.fetchDebtsSummary.mockResolvedValue({ ...summary, debtToIncomePercent: 42 });
      renderPage();
      const banner = await screen.findByRole('region', { name: 'Synthèse des crédits' });
      expect(within(banner).getByText('Au-dessus du repère')).toBeInTheDocument();
      const sentence = within(banner).getByTestId('ratio-text');
      expect(sentence).toHaveTextContent('c’est au-dessus du repère courant de 35 %');
      expect(sentence.className).toContain('text-error');
    });

    it('asks for the income when the ratio is unknown', async () => {
      api.fetchDebtsSummary.mockResolvedValue({ ...summary, debtToIncomePercent: null });
      renderPage();
      const banner = await screen.findByRole('region', { name: 'Synthèse des crédits' });
      expect(within(banner).getByText('Non calculé')).toBeInTheDocument();
      expect(within(banner).getByTestId('ratio-text')).toHaveTextContent('renseignez votre revenu net mensuel dans la page Foyer');
      expect(within(banner).queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('is absent without any active debt, and when the summary cannot be read', async () => {
      api.fetchDebtsSummary.mockResolvedValue({ activeCount: 0, totalRemainingCents: 0, totalMonthlyCents: 0, debtToIncomePercent: null });
      renderPage();
      await screen.findByRole('list', { name: 'Crédits en cours' });
      expect(screen.queryByRole('region', { name: 'Synthèse des crédits' })).not.toBeInTheDocument();
    });

    it('is absent when the summary request fails', async () => {
      api.fetchDebtsSummary.mockRejectedValue(new ApiError(500, 'boom'));
      renderPage();
      await screen.findByRole('list', { name: 'Crédits en cours' });
      expect(screen.queryByRole('region', { name: 'Synthèse des crédits' })).not.toBeInTheDocument();
    });
  });

  describe('creation', () => {
    const openForm = async () => {
      const user = renderPage();
      await screen.findByRole('list', { name: 'Crédits en cours' });
      await user.click(screen.getByRole('button', { name: 'Nouveau crédit' }));
      const dialog = await screen.findByRole('dialog', { name: 'Nouveau crédit' });
      return { user, dialog };
    };

    const fillValid = async (user: ReturnType<typeof renderPage>, dialog: HTMLElement) => {
      await user.type(within(dialog).getByLabelText('Nom du crédit'), 'Prêt travaux');
      await user.click(within(dialog).getByRole('button', { name: 'Immobilier' }));
      await user.type(within(dialog).getByLabelText('Capital emprunté'), '20 000');
      await user.type(within(dialog).getByLabelText('Capital restant dû'), '18 500,50');
      await user.type(within(dialog).getByLabelText('Taux annuel'), '2.45');
      await user.type(within(dialog).getByLabelText('Mensualité'), '250');
      await user.type(within(dialog).getByLabelText('Assurance par mois (facultatif)'), '12,5');
      fireEvent.change(within(dialog).getByLabelText('Date de début du crédit'), { target: { value: '2025-03-01' } });
      await user.clear(within(dialog).getByLabelText('Jour de prélèvement'));
      await user.type(within(dialog).getByLabelText('Jour de prélèvement'), '10');
    };

    it('explains where to find the remaining capital', async () => {
      const { dialog } = await openForm();
      expect(within(dialog).getByText('Le capital restant figure sur votre tableau d’amortissement ou sur le relevé de la banque.')).toBeInTheDocument();
      expect(within(dialog).getByLabelText('Capital restant dû')).toHaveAccessibleDescription(/tableau d’amortissement/);
    });

    it('creates the debt with cents, a decimal rate typed with a point, and no link by default', async () => {
      const { user, dialog } = await openForm();
      await fillValid(user, dialog);
      await user.click(within(dialog).getByRole('button', { name: 'Ajouter le crédit' }));
      await waitFor(() =>
        expect(api.createDebt).toHaveBeenCalledWith('s-common', {
          name: 'Prêt travaux',
          kind: 'MORTGAGE',
          principalCents: 2000000,
          remainingCents: 1850050,
          annualRatePercent: 2.45,
          monthlyPaymentCents: 25000,
          startDate: '2025-03-01',
          paymentDay: 10,
          insuranceMonthlyCents: 1250,
          recurringId: null,
        }),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await waitFor(() => expect(api.fetchDebts).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(api.fetchDebtsSummary).toHaveBeenCalledTimes(2));
      expect(await screen.findByText('Crédit ajouté')).toBeInTheDocument();
    });

    it('accepts a rate typed with a comma', async () => {
      const { user, dialog } = await openForm();
      await fillValid(user, dialog);
      await user.clear(within(dialog).getByLabelText('Taux annuel'));
      await user.type(within(dialog).getByLabelText('Taux annuel'), '3,9');
      await user.click(within(dialog).getByRole('button', { name: 'Ajouter le crédit' }));
      await waitFor(() => expect(api.createDebt).toHaveBeenCalledWith('s-common', expect.objectContaining({ annualRatePercent: 3.9 })));
    });

    it('validates in French before calling the API', async () => {
      const { user, dialog } = await openForm();
      await user.click(within(dialog).getByRole('button', { name: 'Ajouter le crédit' }));
      expect(within(dialog).getByText('Donnez un nom à ce crédit (ex. Prêt auto).')).toBeInTheDocument();
      expect(within(dialog).getByText(/Indiquez le capital emprunté/)).toBeInTheDocument();
      expect(within(dialog).getByText(/Indiquez le capital restant dû \(voir/)).toBeInTheDocument();
      expect(within(dialog).getByText(/Indiquez le taux annuel/)).toBeInTheDocument();
      expect(within(dialog).getByText('Indiquez la mensualité (hors assurance).')).toBeInTheDocument();
      expect(within(dialog).getByLabelText('Nom du crédit')).toHaveAttribute('aria-invalid', 'true');
      expect(api.createDebt).not.toHaveBeenCalled();
    });

    it('refuses a remaining capital above the borrowed one and a payment day outside 1-28', async () => {
      const { user, dialog } = await openForm();
      await fillValid(user, dialog);
      await user.clear(within(dialog).getByLabelText('Capital restant dû'));
      await user.type(within(dialog).getByLabelText('Capital restant dû'), '25000');
      await user.clear(within(dialog).getByLabelText('Jour de prélèvement'));
      await user.type(within(dialog).getByLabelText('Jour de prélèvement'), '30');
      await user.click(within(dialog).getByRole('button', { name: 'Ajouter le crédit' }));
      expect(within(dialog).getByText('Le capital restant ne peut pas dépasser le capital emprunté.')).toBeInTheDocument();
      expect(within(dialog).getByText('Choisissez un jour de prélèvement entre 1 et 28.')).toBeInTheDocument();
      expect(api.createDebt).not.toHaveBeenCalled();
    });

    it('shows a server refusal inside the form and keeps it open', async () => {
      api.createDebt.mockRejectedValue(new ApiError(400, 'invalide'));
      const { user, dialog } = await openForm();
      await fillValid(user, dialog);
      await user.click(within(dialog).getByRole('button', { name: 'Ajouter le crédit' }));
      expect(await within(dialog).findByText(/L’enregistrement a échoué/)).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(within(dialog).getByLabelText('Nom du crédit')).toHaveValue('Prêt travaux');
    });

    it('lists only the active expense recurring payments, « Aucun » first, and sends the chosen one', async () => {
      api.fetchRecurring.mockResolvedValue([
        recurringItem({ id: 'r1', label: 'Prêt auto' }),
        recurringItem({ id: 'r2', label: 'Ancien abonnement', active: false }),
        recurringItem({ id: 'r3', label: 'Salaire', kind: 'INCOME' }),
      ]);
      const { user, dialog } = await openForm();
      const select = await within(dialog).findByLabelText('Paiement récurrent lié (facultatif)');
      expect(within(select).getAllByRole('option').map((option) => plain(option.textContent))).toEqual(['Aucun', 'Prêt auto (320 €)']);
      expect(select).toHaveValue('');
      await user.selectOptions(select, 'r1');
      await fillValid(user, dialog);
      await user.click(within(dialog).getByRole('button', { name: 'Ajouter le crédit' }));
      await waitFor(() => expect(api.createDebt).toHaveBeenCalledWith('s-common', expect.objectContaining({ recurringId: 'r1' })));
    });

    it('shows no recurring selector when the space has none', async () => {
      const { dialog } = await openForm();
      expect(within(dialog).queryByLabelText('Paiement récurrent lié (facultatif)')).not.toBeInTheDocument();
    });
  });

  describe('edition', () => {
    it('opens a debt already filled and saves the changes, keeping its link', async () => {
      api.fetchDebts.mockResolvedValue([debt({ recurringId: 'r1' })]);
      api.fetchRecurring.mockResolvedValue([recurringItem({ id: 'r1' })]);
      const user = renderPage();
      await screen.findByRole('list', { name: 'Crédits en cours' });
      await user.click(screen.getByRole('button', { name: 'Modifier Prêt auto' }));
      const dialog = await screen.findByRole('dialog', { name: 'Modifier le crédit' });
      expect(within(dialog).getByLabelText('Nom du crédit')).toHaveValue('Prêt auto');
      expect(within(dialog).getByLabelText('Capital emprunté')).toHaveValue('15000');
      expect(within(dialog).getByLabelText('Capital restant dû')).toHaveValue('11200');
      expect(within(dialog).getByLabelText('Taux annuel')).toHaveValue('3,9');
      expect(within(dialog).getByLabelText('Assurance par mois (facultatif)')).toHaveValue('15');
      expect(await within(dialog).findByLabelText('Paiement récurrent lié (facultatif)')).toHaveValue('r1');
      await user.clear(within(dialog).getByLabelText('Capital restant dû'));
      await user.type(within(dialog).getByLabelText('Capital restant dû'), '10 800');
      await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
      await waitFor(() =>
        expect(api.updateDebt).toHaveBeenCalledWith('s-common', 'd1', expect.objectContaining({ remainingCents: 1080000, annualRatePercent: 3.9, recurringId: 'r1', archived: false })),
      );
      expect(await screen.findByText('Crédit modifié')).toBeInTheDocument();
    });
  });

  describe('detail, actions and what-if simulator', () => {
    const openDetail = async (name = 'Prêt auto') => {
      const user = renderPage();
      await screen.findByRole('list', { name: 'Crédits en cours' });
      await user.click(screen.getByRole('button', { name: `Simuler un remboursement de ${name}` }));
      const dialog = await screen.findByRole('dialog', { name });
      return { user, dialog };
    };

    it('recaps the debt and shows the simulator', async () => {
      const { dialog } = await openDetail();
      const text = plain(dialog.textContent);
      expect(text).toContain('Auto · Taux 3,9 %');
      expect(text).toContain('335 €');
      expect(text).toContain('le 5 du mois');
      expect(text).toContain('Crédit commencé le 1 septembre 2024');
      expect(within(dialog).getByRole('heading', { name: 'Et si je remboursais plus vite ?' })).toBeInTheDocument();
      expect(within(dialog).getByLabelText('Versement supplémentaire par mois')).toBeInTheDocument();
      expect(within(dialog).getByLabelText('Remboursement partiel immédiat')).toBeInTheDocument();
    });

    it('requires at least one amount above 0', async () => {
      const { user, dialog } = await openDetail();
      await user.click(within(dialog).getByRole('button', { name: 'Simuler' }));
      expect(within(dialog).getByText(/Indiquez au moins un montant supérieur à 0/)).toBeInTheDocument();
      expect(api.fetchDebtWhatIf).not.toHaveBeenCalled();
    });

    it('simulates with the monthly extra, then shows before/after, the savings sentence and the early-repayment note', async () => {
      const { user, dialog } = await openDetail();
      await user.type(within(dialog).getByLabelText('Versement supplémentaire par mois'), '100');
      await user.click(within(dialog).getByRole('button', { name: 'Simuler' }));
      await waitFor(() => expect(api.fetchDebtWhatIf).toHaveBeenCalledWith('s-common', 'd1', { extraMonthlyCents: 10000, lumpSumCents: 0 }));
      const result = await within(dialog).findByTestId('what-if-result');
      const before = within(result).getByTestId('what-if-baseline');
      const after = within(result).getByTestId('what-if-scenario');
      expect(plain(before.textContent)).toContain('38 mois');
      expect(plain(before.textContent)).toContain('5 décembre 2029');
      expect(plain(before.textContent)).toContain('960 €');
      expect(plain(after.textContent)).toContain('29 mois');
      expect(plain(after.textContent)).toContain('5 mars 2029');
      expect(plain(after.textContent)).toContain('690 €');
      expect(plain(within(result).getByRole('status').textContent)).toBe('Vous économiseriez 270 € d’intérêts et 9 mois.');
      const note = within(result).getByRole('note', { name: 'Indemnités de remboursement anticipé' });
      expect(note).toHaveTextContent('Vérifiez les indemnités de remboursement anticipé de votre contrat.');
    });

    it('sends both amounts in cents and shows the server note, whatever it says', async () => {
      api.fetchDebtWhatIf.mockResolvedValue({ ...whatIf, note: 'Note spéciale du serveur.' });
      const { user, dialog } = await openDetail();
      await user.type(within(dialog).getByLabelText('Versement supplémentaire par mois'), '50,50');
      await user.type(within(dialog).getByLabelText('Remboursement partiel immédiat'), '2 000');
      await user.click(within(dialog).getByRole('button', { name: 'Simuler' }));
      await waitFor(() => expect(api.fetchDebtWhatIf).toHaveBeenCalledWith('s-common', 'd1', { extraMonthlyCents: 5050, lumpSumCents: 200000 }));
      expect(await within(dialog).findByText('Note spéciale du serveur.')).toBeInTheDocument();
    });

    it('never shows a negative saving', async () => {
      api.fetchDebtWhatIf.mockResolvedValue({ ...whatIf, interestSavedCents: -4000, monthsSaved: -1 });
      const { user, dialog } = await openDetail();
      await user.type(within(dialog).getByLabelText('Remboursement partiel immédiat'), '500');
      await user.click(within(dialog).getByRole('button', { name: 'Simuler' }));
      const result = await within(dialog).findByTestId('what-if-result');
      expect(within(result).getByRole('status').textContent).not.toMatch(/-|−/);
      expect(within(result).getByRole('status')).toHaveTextContent('ne changerait presque rien');
    });

    it('shows a loading state while simulating', async () => {
      let release: (value: unknown) => void = () => undefined;
      api.fetchDebtWhatIf.mockReturnValue(new Promise((resolve) => (release = resolve)));
      const { user, dialog } = await openDetail();
      await user.type(within(dialog).getByLabelText('Versement supplémentaire par mois'), '100');
      await user.click(within(dialog).getByRole('button', { name: 'Simuler' }));
      expect(await within(dialog).findByRole('button', { name: 'Simulation en cours…' })).toBeDisabled();
      expect(within(dialog).getAllByText('Simulation en cours…').length).toBeGreaterThan(0);
      release(whatIf);
      expect(await within(dialog).findByTestId('what-if-result')).toBeInTheDocument();
    });

    it('explains a server error and retries with the same amounts', async () => {
      api.fetchDebtWhatIf.mockRejectedValueOnce(new ApiError(500, 'boom'));
      const { user, dialog } = await openDetail();
      await user.type(within(dialog).getByLabelText('Versement supplémentaire par mois'), '100');
      await user.click(within(dialog).getByRole('button', { name: 'Simuler' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('La simulation a échoué');
      await user.click(within(dialog).getByRole('button', { name: 'Réessayer' }));
      expect(await within(dialog).findByTestId('what-if-result')).toBeInTheDocument();
      expect(api.fetchDebtWhatIf).toHaveBeenCalledTimes(2);
      expect(api.fetchDebtWhatIf).toHaveBeenLastCalledWith('s-common', 'd1', { extraMonthlyCents: 10000, lumpSumCents: 0 });
    });

    it('says when it is offline and keeps the amounts', async () => {
      api.fetchDebtWhatIf.mockRejectedValue(new NetworkError());
      const { user, dialog } = await openDetail();
      await user.type(within(dialog).getByLabelText('Versement supplémentaire par mois'), '100');
      await user.click(within(dialog).getByRole('button', { name: 'Simuler' }));
      expect(await within(dialog).findByText(/Hors ligne : la simulation a besoin du réseau/)).toBeInTheDocument();
      expect(within(dialog).getByLabelText('Versement supplémentaire par mois')).toHaveValue('100');
    });

    it('clears an outdated result when an amount changes', async () => {
      const { user, dialog } = await openDetail();
      await user.type(within(dialog).getByLabelText('Versement supplémentaire par mois'), '100');
      await user.click(within(dialog).getByRole('button', { name: 'Simuler' }));
      await within(dialog).findByTestId('what-if-result');
      await user.type(within(dialog).getByLabelText('Versement supplémentaire par mois'), '0');
      expect(within(dialog).queryByTestId('what-if-result')).not.toBeInTheDocument();
    });

    it('gives no buy-back or renegotiation advice', async () => {
      const { user, dialog } = await openDetail();
      await user.type(within(dialog).getByLabelText('Versement supplémentaire par mois'), '100');
      await user.click(within(dialog).getByRole('button', { name: 'Simuler' }));
      await within(dialog).findByTestId('what-if-result');
      expect(dialog.textContent).not.toMatch(/rachat|renégoci/i);
    });

    it('does not offer to simulate a debt that is fully repaid', async () => {
      const user = renderPage();
      await screen.findByRole('list', { name: 'Crédits en cours' });
      await user.click(screen.getByText('Crédits archivés (1)'));
      await user.click(screen.getAllByRole('button', { name: 'Simuler un remboursement de Ancien prêt' })[0]);
      const dialog = await screen.findByRole('dialog', { name: 'Ancien prêt' });
      expect(within(dialog).getByText(/entièrement remboursé/)).toBeInTheDocument();
      expect(within(dialog).queryByRole('button', { name: 'Simuler' })).not.toBeInTheDocument();
    });

    it('archives a debt from the detail', async () => {
      const { user, dialog } = await openDetail();
      await user.click(within(dialog).getByRole('button', { name: 'Archiver' }));
      await waitFor(() => expect(api.updateDebt).toHaveBeenCalledWith('s-common', 'd1', expect.objectContaining({ name: 'Prêt auto', archived: true })));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(await screen.findByText(/Crédit archivé/)).toBeInTheDocument();
    });

    it('asks for confirmation before deleting', async () => {
      const { user, dialog } = await openDetail();
      await user.click(within(dialog).getByRole('button', { name: 'Supprimer le crédit' }));
      expect(within(dialog).getByText('Supprimer ce crédit ?')).toBeInTheDocument();
      expect(api.deleteDebt).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole('button', { name: 'Non' }));
      expect(api.deleteDebt).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole('button', { name: 'Supprimer le crédit' }));
      await user.click(within(dialog).getByRole('button', { name: 'Supprimer le crédit' }));
      await waitFor(() => expect(api.deleteDebt).toHaveBeenCalledWith('s-common', 'd1'));
      expect(await screen.findByText('Crédit supprimé')).toBeInTheDocument();
    });

    it('explains a failed deletion with a toast', async () => {
      api.deleteDebt.mockRejectedValue(new NetworkError());
      const { user, dialog } = await openDetail();
      await user.click(within(dialog).getByRole('button', { name: 'Supprimer le crédit' }));
      await user.click(within(dialog).getByRole('button', { name: 'Supprimer le crédit' }));
      expect(await screen.findByText(/Pas de connexion/)).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
