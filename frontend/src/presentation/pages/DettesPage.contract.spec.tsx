import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { debt, debtPayload, debtsSummary } from '../../test/fixtures';
import { renderInApp } from '../../test/render-app';

const api = vi.hoisted(() => ({
  fetchDebts: vi.fn<ApiMock<'fetchDebts'>>(),
  fetchDebtsSummary: vi.fn<ApiMock<'fetchDebtsSummary'>>(),
  createDebt: vi.fn<ApiMock<'createDebt'>>(),
  updateDebt: vi.fn<ApiMock<'updateDebt'>>(),
  deleteDebt: vi.fn<ApiMock<'deleteDebt'>>(),
  fetchDebtWhatIf: vi.fn<ApiMock<'fetchDebtWhatIf'>>(),
  fetchRecurring: vi.fn<ApiMock<'fetchRecurring'>>(),
  fetchAccounts: vi.fn<ApiMock<'fetchAccounts'>>(),
}));

vi.mock('../../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/api-client')>()),
  apiClient: api,
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'alice', email: 'alice@example.test', name: 'Alice' },
    loading: false,
    logout: vi.fn<() => Promise<void>>(),
  }),
}));

import { DettesPage } from './DettesPage';
import type { ApiMock } from '../../test/api-mock';

const plain = (value: string | null | undefined) =>
  (value ?? '').replace(/[\s  ]/g, ' ');

/** Un crédit complet, tel que le serveur de la tranche 12 le renvoie. */
const house = debt({
  id: 'h1',
  name: 'Prêt maison',
  kind: 'MORTGAGE',
  lender: 'Crédit Agricole',
  contractReference: 'PRET-12345',
  initialTermMonths: 240,
  rateType: 'FIXED',
  insuranceMode: 'PERCENT_INITIAL',
  insuranceRatePercent: 0.3,
  insuranceQuotityPercent: 200,
  insuranceMonthlyCents: 0,
  monthlyInsuranceCents: 1500,
  monthlyTotalCents: 33500,
  feesCents: 90000,
  guaranteeKind: 'SURETY',
  guaranteeCents: 150000,
  notes:
    'Remboursement anticipé : 3 % max des sommes remboursées.\nVoir l’offre de prêt.',
  remainingInsuranceCents: 57000,
  remainingCostCents: 153000,
  paymentCheck: {
    status: 'OK',
    expectedMonthlyPaymentCents: 31950,
    differenceCents: 50,
    differencePercent: 0,
  },
});

const gap = debt({
  id: 'g1',
  name: 'Prêt travaux',
  kind: 'CONSUMER',
  remainingCents: 900000,
  lender: 'LCL',
  initialTermMonths: 120,
  rateType: null,
  paymentCheck: {
    status: 'GAP',
    expectedMonthlyPaymentCents: 28500,
    differenceCents: 3500,
    differencePercent: 12,
  },
});

const variable = debt({
  id: 'v1',
  name: 'Prêt variable',
  remainingCents: 500000,
  initialTermMonths: 180,
  rateType: 'VARIABLE',
  paymentCheck: {
    status: 'UNKNOWN',
    expectedMonthlyPaymentCents: null,
    differenceCents: null,
    differencePercent: null,
  },
});

const plainOld = debt({
  id: 'o1',
  name: 'Prêt simple',
  remainingCents: 100000,
});

const whatIf = {
  baseline: {
    monthsRemaining: 38,
    totalInterestRemainingCents: 96000,
    payoffDate: '2029-12-05',
  },
  scenario: {
    monthsRemaining: 29,
    totalInterestRemainingCents: 69000,
    payoffDate: '2029-03-05',
  },
  interestSavedCents: 27000,
  monthsSaved: 9,
  insuranceSavedCents: 4300,
  note: 'Vérifiez les indemnités de remboursement anticipé de votre contrat.',
};

const renderPage = () =>
  renderInApp(<DettesPage />, { path: '/dettes', kind: 'COMMON' });

const cardOf = async (name: string) => {
  const list = await screen.findByRole('list', { name: 'Crédits en cours' });
  return within(list)
    .getAllByTestId('debt-card')
    .find((item) => item.textContent?.includes(name)) as HTMLElement;
};

describe('DettesPage — prêts enrichis', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchAccounts.mockResolvedValue([]);
    api.fetchRecurring.mockResolvedValue([]);
    api.fetchDebts.mockResolvedValue([house, gap, variable, plainOld]);
    api.fetchDebtsSummary.mockResolvedValue(
      debtsSummary({
        activeCount: 4,
        totalRemainingCents: 5000000,
        totalMonthlyInsuranceCents: 6000,
        totalRemainingCostCents: 780000,
        byLender: [
          {
            lender: 'Crédit Agricole',
            activeCount: 2,
            remainingCents: 3500000,
            monthlyTotalCents: 90000,
          },
          {
            lender: 'LCL',
            activeCount: 1,
            remainingCents: 900000,
            monthlyTotalCents: 40000,
          },
          {
            lender: '',
            activeCount: 1,
            remainingCents: 100000,
            monthlyTotalCents: 8000,
          },
        ],
      }),
    );
    api.createDebt.mockResolvedValue(house);
    api.updateDebt.mockResolvedValue(undefined);
    api.fetchDebtWhatIf.mockResolvedValue(whatIf);
  });

  describe('card', () => {
    it('shows the lender under the name, the rate type and the total monthly amount with its detail', async () => {
      renderPage();
      const card = await cardOf('Prêt maison');
      expect(within(card).getByTestId('debt-lender')).toHaveTextContent(
        'Crédit Agricole',
      );
      expect(plain(card.textContent)).toContain(
        'Immobilier · Taux 3,9 % (fixe)',
      );
      expect(plain(card.textContent)).toContain('335 € par mois au total');
      expect(plain(card.textContent)).toContain(
        '(320 € par mois, plus 15 € d’assurance)',
      );
    });

    it('shows the remaining cost and the remaining insurance', async () => {
      renderPage();
      const text = plain((await cardOf('Prêt maison')).textContent);
      expect(text).toContain('Intérêts restant à payer : 960 €');
      expect(text).toContain('Assurance restant à payer : 570 €');
      expect(text).toContain('Coût restant (intérêts + assurance) : 1 530 €');
    });

    it('shows nothing new for a debt without these details (older backend)', async () => {
      renderPage();
      const card = await cardOf('Prêt simple');
      expect(within(card).queryByTestId('debt-lender')).not.toBeInTheDocument();
      expect(card).not.toHaveTextContent('Coût restant');
      expect(card).not.toHaveTextContent('Assurance restant');
      expect(within(card).queryByTestId('payment-gap')).not.toBeInTheDocument();
      expect(
        within(card).queryByTestId('rate-type-warning'),
      ).not.toBeInTheDocument();
    });

    it('warns in words that a variable rate makes the figures estimates', async () => {
      renderPage();
      const card = await cardOf('Prêt variable');
      expect(within(card).getByTestId('rate-type-warning')).toHaveTextContent(
        'Taux variable : les calculs supposent un taux fixe',
      );
      expect(plain(card.textContent)).toContain('(variable)');
    });

    it('flags a payment gap with text and an icon, naming both amounts, and without any renegotiation advice', async () => {
      renderPage();
      const card = await cardOf('Prêt travaux');
      const notice = within(card).getByTestId('payment-gap');
      expect(notice).toHaveAttribute('role', 'note');
      expect(notice.querySelector('svg')).not.toBeNull();
      expect(plain(notice.textContent)).toContain(
        'La mensualité saisie (320 €) ne correspond pas à ce que donneraient le capital, le taux et la durée d’origine (285 €) : vérifiez votre saisie ou la durée.',
      );
      expect(notice).toHaveTextContent('Mensualité à vérifier');
      expect(card.textContent).not.toMatch(/renégoci|rachat|racheter/i);
    });

    it('does not flag consistent or unverifiable debts on the card', async () => {
      renderPage();
      expect(
        within(await cardOf('Prêt maison')).queryByTestId('payment-gap'),
      ).not.toBeInTheDocument();
      expect(
        within(await cardOf('Prêt variable')).queryByTestId('payment-gap'),
      ).not.toBeInTheDocument();
      expect(screen.getAllByTestId('payment-gap')).toHaveLength(1);
    });
  });

  describe('detail', () => {
    const openDetail = async (name: string) => {
      const user = renderPage();
      await screen.findByRole('list', { name: 'Crédits en cours' });
      await user.click(
        screen.getByRole('button', {
          name: `Simuler un remboursement de ${name}`,
        }),
      );
      const dialog = await screen.findByRole('dialog', { name });
      return { user, dialog };
    };

    it('shows the lender with the contract reference, the total, the remaining cost and insurance', async () => {
      const { dialog } = await openDetail('Prêt maison');
      expect(within(dialog).getByTestId('debt-lender')).toHaveTextContent(
        'Crédit Agricole · Réf. PRET-12345',
      );
      const text = plain(dialog.textContent);
      expect(text).toContain('Prélevé chaque mois');
      expect(text).toContain('335 €');
      expect(text).toContain('320 € de mensualité + 15 € d’assurance');
      expect(
        plain(within(dialog).getByTestId('remaining-cost').textContent),
      ).toContain('1 530 €');
      expect(
        plain(within(dialog).getByTestId('remaining-cost').textContent),
      ).toContain('Intérêts : 960 € + assurance : 570 €');
      expect(
        plain(within(dialog).getByTestId('remaining-insurance').textContent),
      ).toContain('570 €');
    });

    it('lists the contract: term, rate type, insurance, fees and guarantee', async () => {
      const { dialog } = await openDetail('Prêt maison');
      const contract = within(dialog).getByRole('region', {
        name: 'Le contrat',
      });
      const text = plain(contract.textContent);
      expect(text).toContain('Durée initiale240 mois (20 ans)');
      expect(text).toContain('Type de tauxFixe');
      expect(text).toContain(
        '0,3 % du capital emprunté par an, quotité 200 % (environ 15 € par mois)',
      );
      expect(text).toContain('Frais de dossier900 €');
      expect(text).toContain('GarantieCaution · 1 500 €');
    });

    it('folds the notes and shows them as written', async () => {
      const { user, dialog } = await openDetail('Prêt maison');
      const notes =
        within(dialog).getByTestId<HTMLDetailsElement>('debt-notes');
      expect(notes.open).toBe(false);
      await user.click(within(notes).getByText('Notes'));
      expect(notes.open).toBe(true);
      expect(notes).toHaveTextContent(
        'Remboursement anticipé : 3 % max des sommes remboursées.',
      );
      expect(notes).toHaveTextContent('Voir l’offre de prêt.');
    });

    it('says the monthly payment is consistent when the check is OK', async () => {
      const { dialog } = await openDetail('Prêt maison');
      expect(within(dialog).getByTestId('payment-ok')).toHaveTextContent(
        'La mensualité saisie correspond au capital, au taux et à la durée d’origine.',
      );
    });

    it('shows the gap alert in the detail too', async () => {
      const { dialog } = await openDetail('Prêt travaux');
      expect(
        plain(within(dialog).getByTestId('payment-gap').textContent),
      ).toContain(
        'ne correspond pas à ce que donneraient le capital, le taux et la durée d’origine (285 €)',
      );
    });

    it('explains quietly why it cannot check, with a variable rate or without a term', async () => {
      const variableOpen = await openDetail('Prêt variable');
      expect(
        within(variableOpen.dialog).getByTestId('payment-unknown'),
      ).toHaveTextContent('taux variable ou révisable');
      expect(
        within(variableOpen.dialog).getByTestId('rate-type-warning'),
      ).toHaveTextContent('les calculs supposent un taux fixe');
      expect(
        within(variableOpen.dialog).queryByRole('alert'),
      ).not.toBeInTheDocument();
    });

    it('asks for the term when it is missing, without alarm', async () => {
      const { dialog } = await openDetail('Prêt simple');
      expect(within(dialog).getByTestId('payment-unknown')).toHaveTextContent(
        'indiquez la durée initiale du prêt',
      );
      expect(
        within(dialog).queryByTestId('payment-gap'),
      ).not.toBeInTheDocument();
      expect(
        within(dialog).queryByTestId('debt-notes'),
      ).not.toBeInTheDocument();
      expect(
        within(dialog).queryByText('Frais de dossier'),
      ).not.toBeInTheDocument();
      expect(within(dialog).queryByText('Garantie')).not.toBeInTheDocument();
      expect(plain(dialog.textContent)).toContain('Type de tauxNon précisé');
      expect(plain(dialog.textContent)).toContain('Assurance15 € par mois');
    });

    it('shows the insurance saved by a what-if, and keeps the early-repayment note', async () => {
      const { user, dialog } = await openDetail('Prêt maison');
      await user.type(
        within(dialog).getByLabelText('Versement supplémentaire par mois'),
        '100',
      );
      await user.click(within(dialog).getByRole('button', { name: 'Simuler' }));
      const result = await within(dialog).findByTestId('what-if-result');
      expect(plain(within(result).getByRole('status').textContent)).toBe(
        'Vous économiseriez 270 € d’intérêts et 9 mois, et environ 43 € d’assurance en moins.',
      );
      expect(
        within(result).getByRole('note', {
          name: 'Indemnités de remboursement anticipé',
        }),
      ).toHaveTextContent('Vérifiez les indemnités de remboursement anticipé');
    });

    it.each([[0], [null], [-500]])(
      'says nothing about insurance when the saving is %s',
      async (saved) => {
        api.fetchDebtWhatIf.mockResolvedValue({
          ...whatIf,
          insuranceSavedCents: saved,
        });
        const { user, dialog } = await openDetail('Prêt maison');
        await user.type(
          within(dialog).getByLabelText('Versement supplémentaire par mois'),
          '100',
        );
        await user.click(
          within(dialog).getByRole('button', { name: 'Simuler' }),
        );
        const result = await within(dialog).findByTestId('what-if-result');
        expect(plain(within(result).getByRole('status').textContent)).toBe(
          'Vous économiseriez 270 € d’intérêts et 9 mois.',
        );
        expect(result.textContent).not.toMatch(/-|−/);
      },
    );
  });

  describe('summary', () => {
    it('adds the total insurance and the total remaining cost', async () => {
      renderPage();
      const banner = await screen.findByRole('region', {
        name: 'Synthèse des crédits',
      });
      expect(
        plain(within(banner).getByTestId('summary-insurance').textContent),
      ).toBe('60 €');
      expect(
        plain(within(banner).getByTestId('summary-remaining-cost').textContent),
      ).toBe('7 800 €');
      expect(plain(banner.textContent)).toContain('Dont assurances');
      expect(plain(banner.textContent)).toContain('Coût restant total');
    });

    it('groups the credits by lender, « Prêteur non précisé » for the others', async () => {
      renderPage();
      const banner = await screen.findByRole('region', {
        name: 'Synthèse des crédits',
      });
      expect(
        within(banner).getByRole('heading', { name: 'Par prêteur' }),
      ).toBeInTheDocument();
      const rows = within(banner).getAllByTestId('lender-row');
      expect(rows).toHaveLength(3);
      expect(plain(rows[0].textContent)).toBe(
        'Crédit Agricole2 crédits en cours · Capital restant 35 000 € · 900 € par mois',
      );
      expect(plain(rows[1].textContent)).toBe(
        'LCL1 crédit en cours · Capital restant 9 000 € · 400 € par mois',
      );
      expect(plain(rows[2].textContent)).toBe(
        'Prêteur non précisé1 crédit en cours · Capital restant 1 000 € · 80 € par mois',
      );
    });

    it('hides the new blocks when the server sends nothing about them', async () => {
      api.fetchDebtsSummary.mockResolvedValue(debtsSummary());
      renderPage();
      const banner = await screen.findByRole('region', {
        name: 'Synthèse des crédits',
      });
      expect(within(banner).queryByText('Par prêteur')).not.toBeInTheDocument();
      expect(
        within(banner).queryByTestId('summary-insurance'),
      ).not.toBeInTheDocument();
      expect(
        within(banner).queryByTestId('summary-remaining-cost'),
      ).not.toBeInTheDocument();
      expect(plain(banner.textContent)).toContain('Taux d’endettement');
    });

    it('does not show a lender block that only holds « Prêteur non précisé »', async () => {
      api.fetchDebtsSummary.mockResolvedValue(
        debtsSummary({
          byLender: [
            {
              lender: '',
              activeCount: 2,
              remainingCents: 100,
              monthlyTotalCents: 100,
            },
          ],
        }),
      );
      renderPage();
      const banner = await screen.findByRole('region', {
        name: 'Synthèse des crédits',
      });
      expect(within(banner).queryByText('Par prêteur')).not.toBeInTheDocument();
    });
  });

  describe('form', () => {
    const openForm = async () => {
      const user = renderPage();
      await screen.findByRole('list', { name: 'Crédits en cours' });
      await user.click(screen.getByRole('button', { name: 'Nouveau crédit' }));
      const dialog = await screen.findByRole('dialog', {
        name: 'Nouveau crédit',
      });
      return { user, dialog };
    };

    const fillBasics = async (
      user: ReturnType<typeof renderPage>,
      dialog: HTMLElement,
    ) => {
      await user.type(
        within(dialog).getByLabelText('Nom du crédit'),
        'Prêt maison',
      );
      await user.type(
        within(dialog).getByLabelText('Capital emprunté'),
        '200 000',
      );
      await user.type(
        within(dialog).getByLabelText('Capital restant dû'),
        '180 000',
      );
      await user.type(within(dialog).getByLabelText('Taux annuel'), '3,5');
      await user.type(within(dialog).getByLabelText('Mensualité'), '1 160');
      fireEvent.change(
        within(dialog).getByLabelText('Date de début du crédit'),
        { target: { value: '2024-01-01' } },
      );
    };

    const submit = async (
      user: ReturnType<typeof renderPage>,
      dialog: HTMLElement,
    ) =>
      user.click(
        within(dialog).getByRole('button', { name: 'Ajouter le crédit' }),
      );

    it('suggests the lenders already entered in the space, once each', async () => {
      const { dialog } = await openForm();
      const options = within(dialog)
        .getByTestId('lender-options')
        .querySelectorAll('option');
      expect(
        [...options].map((option) => option.getAttribute('value')),
      ).toEqual(['Crédit Agricole', 'LCL']);
      expect(
        within(dialog).getByLabelText('Prêteur (facultatif)'),
      ).toHaveAttribute('list', 'debt-lender-options');
      expect(
        within(dialog).getByLabelText('Prêteur (facultatif)'),
      ).toHaveAttribute('maxlength', '80');
    });

    it('sends the contract defaults when the new fields are left empty', async () => {
      const { user, dialog } = await openForm();
      await fillBasics(user, dialog);
      await submit(user, dialog);
      await waitFor(() =>
        expect(api.createDebt).toHaveBeenCalledWith(
          's-common',
          debtPayload({
            name: 'Prêt maison',
            kind: 'CONSUMER',
            principalCents: 20000000,
            remainingCents: 18000000,
            annualRatePercent: 3.5,
            monthlyPaymentCents: 116000,
            startDate: '2024-01-01',
            paymentDay: expect.any(Number) as unknown as number,
            insuranceMonthlyCents: 0,
          }),
        ),
      );
    });

    it('sends every detail of a full contract', async () => {
      const { user, dialog } = await openForm();
      await fillBasics(user, dialog);
      await user.type(
        within(dialog).getByLabelText('Prêteur (facultatif)'),
        'Crédit Agricole',
      );
      await user.click(within(dialog).getByRole('button', { name: 'Fixe' }));
      await user.click(
        within(dialog).getByRole('button', { name: 'En années et mois' }),
      );
      await user.type(within(dialog).getByLabelText('Durée : années'), '20');
      await user.type(
        within(dialog).getByLabelText('Durée : mois en plus'),
        '6',
      );
      await user.selectOptions(
        within(dialog).getByLabelText(
          'Comment l’assurance est-elle calculée ?',
        ),
        'PERCENT_INITIAL',
      );
      await user.type(
        within(dialog).getByLabelText('Taux annuel de l’assurance'),
        '0,36',
      );
      await user.clear(within(dialog).getByLabelText('Quotité assurée'));
      await user.type(within(dialog).getByLabelText('Quotité assurée'), '200');
      await user.type(
        within(dialog).getByLabelText('Référence du contrat'),
        'PRET-12345',
      );
      await user.type(within(dialog).getByLabelText('Frais de dossier'), '900');
      await user.selectOptions(
        within(dialog).getByLabelText('Garantie'),
        'SURETY',
      );
      await user.type(
        within(dialog).getByLabelText('Frais de garantie'),
        '1 500',
      );
      await user.type(
        within(dialog).getByLabelText('Notes'),
        'Remboursement anticipé : 3 % max.',
      );
      await submit(user, dialog);
      await waitFor(() =>
        expect(api.createDebt).toHaveBeenCalledWith(
          's-common',
          expect.objectContaining({
            lender: 'Crédit Agricole',
            contractReference: 'PRET-12345',
            initialTermMonths: 246,
            rateType: 'FIXED',
            insuranceMode: 'PERCENT_INITIAL',
            insuranceMonthlyCents: 0,
            insuranceRatePercent: 0.36,
            insuranceQuotityPercent: 200,
            feesCents: 90000,
            guaranteeKind: 'SURETY',
            guaranteeCents: 150000,
            notes: 'Remboursement anticipé : 3 % max.',
          }),
        ),
      );
    });

    it('accepts the term in months', async () => {
      const { user, dialog } = await openForm();
      await fillBasics(user, dialog);
      await user.type(within(dialog).getByLabelText('Durée en mois'), '240');
      await submit(user, dialog);
      await waitFor(() =>
        expect(api.createDebt).toHaveBeenCalledWith(
          's-common',
          expect.objectContaining({ initialTermMonths: 240 }),
        ),
      );
    });

    it('refuses a term outside 1 to 600 months', async () => {
      const { user, dialog } = await openForm();
      await fillBasics(user, dialog);
      await user.type(within(dialog).getByLabelText('Durée en mois'), '601');
      await submit(user, dialog);
      expect(
        within(dialog).getByText(
          /La durée doit être comprise entre 1 et 600 mois/,
        ),
      ).toBeInTheDocument();
      expect(within(dialog).getByLabelText('Durée en mois')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      expect(api.createDebt).not.toHaveBeenCalled();
    });

    it('explains the rate type: calculations assume a fixed rate', async () => {
      const { user, dialog } = await openForm();
      const group = within(dialog).getByRole('group', { name: 'Type de taux' });
      expect(group).toHaveAccessibleDescription(
        'Les calculs supposent un taux fixe ; avec un taux variable ou révisable, ils restent des estimations.',
      );
      expect(
        within(group)
          .getAllByRole('button')
          .map((button) => button.textContent),
      ).toEqual(['Non précisé', 'Fixe', 'Variable', 'Révisable']);
      expect(
        within(group).getByRole('button', { name: 'Non précisé' }),
      ).toHaveAttribute('aria-pressed', 'true');
      await user.click(within(group).getByRole('button', { name: 'Variable' }));
      expect(
        within(group).getByRole('button', { name: 'Variable' }),
      ).toHaveAttribute('aria-pressed', 'true');
      expect(within(dialog).getByRole('status')).toHaveTextContent(
        'Taux variable : les calculs supposent un taux fixe',
      );
    });

    it('offers the three insurance modes and shows the right fields for each', async () => {
      const { user, dialog } = await openForm();
      const mode = within(dialog).getByLabelText(
        'Comment l’assurance est-elle calculée ?',
      );
      expect(
        within(mode)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual([
        'Montant mensuel fixe',
        '% du capital emprunté',
        '% du capital restant dû',
      ]);
      expect(
        within(dialog).getByLabelText('Assurance par mois (facultatif)'),
      ).toBeInTheDocument();
      expect(
        within(dialog).queryByLabelText('Taux annuel de l’assurance'),
      ).not.toBeInTheDocument();
      expect(
        within(dialog).queryByLabelText('Quotité assurée'),
      ).not.toBeInTheDocument();

      await user.selectOptions(mode, 'PERCENT_REMAINING');
      expect(
        within(dialog).queryByLabelText('Assurance par mois (facultatif)'),
      ).not.toBeInTheDocument();
      expect(
        within(dialog).getByLabelText('Taux annuel de l’assurance'),
      ).toHaveAccessibleDescription(/capital restant dû/);
      expect(within(dialog).getByLabelText('Quotité assurée')).toHaveValue(
        '100',
      );
      expect(
        within(dialog).getByLabelText('Quotité assurée'),
      ).toHaveAccessibleDescription(
        'La part du prêt couverte par l’assurance. Deux emprunteurs assurés chacun à 100 % : 200 %.',
      );

      await user.selectOptions(mode, 'PERCENT_INITIAL');
      expect(
        within(dialog).getByLabelText('Taux annuel de l’assurance'),
      ).toHaveAccessibleDescription(/capital emprunté/);
    });

    it('requires the insurance rate in percentage modes and validates the quotity', async () => {
      const { user, dialog } = await openForm();
      await fillBasics(user, dialog);
      await user.selectOptions(
        within(dialog).getByLabelText(
          'Comment l’assurance est-elle calculée ?',
        ),
        'PERCENT_INITIAL',
      );
      await user.clear(within(dialog).getByLabelText('Quotité assurée'));
      await user.type(within(dialog).getByLabelText('Quotité assurée'), '250');
      await submit(user, dialog);
      expect(
        within(dialog).getByText(/Indiquez le taux annuel de l’assurance/),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText(
          /La quotité doit être un nombre entier entre 1 et 200/,
        ),
      ).toBeInTheDocument();
      expect(api.createDebt).not.toHaveBeenCalled();
    });

    it('refuses a guarantee amount when the guarantee is « Aucune »', async () => {
      const { user, dialog } = await openForm();
      await fillBasics(user, dialog);
      await user.type(
        within(dialog).getByLabelText('Frais de garantie'),
        '500',
      );
      await submit(user, dialog);
      expect(
        within(dialog).getByText(/Choisissez le type de garantie/),
      ).toBeInTheDocument();
      expect(api.createDebt).not.toHaveBeenCalled();
      await user.selectOptions(
        within(dialog).getByLabelText('Garantie'),
        'MORTGAGE',
      );
      await submit(user, dialog);
      await waitFor(() =>
        expect(api.createDebt).toHaveBeenCalledWith(
          's-common',
          expect.objectContaining({
            guaranteeKind: 'MORTGAGE',
            guaranteeCents: 50000,
          }),
        ),
      );
    });

    it('counts the characters of the notes and advises against bank account numbers', async () => {
      const { user, dialog } = await openForm();
      expect(within(dialog).getByTestId('notes-count')).toHaveTextContent(
        '0 / 500 caractères',
      );
      await user.type(within(dialog).getByLabelText('Notes'), 'Bonjour');
      expect(within(dialog).getByTestId('notes-count')).toHaveTextContent(
        '7 / 500 caractères',
      );
      expect(within(dialog).getByLabelText('Notes')).toHaveAttribute(
        'maxlength',
        '500',
      );
      expect(
        within(dialog).getByLabelText('Notes'),
      ).toHaveAccessibleDescription(/N’y mettez jamais de numéro de compte/);
    });

    it('opens the optional block only when editing a debt that already has something in it', async () => {
      const user = renderPage();
      await screen.findByRole('list', { name: 'Crédits en cours' });
      await user.click(
        screen.getByRole('button', { name: 'Modifier Prêt simple' }),
      );
      const simple = await screen.findByRole('dialog', {
        name: 'Modifier le crédit',
      });
      expect(
        within(simple).getByTestId<HTMLDetailsElement>('contract-details').open,
      ).toBe(false);
      await user.click(within(simple).getByRole('button', { name: 'Fermer' }));
      await user.click(
        screen.getByRole('button', { name: 'Modifier Prêt maison' }),
      );
      const full = await screen.findByRole('dialog', {
        name: 'Modifier le crédit',
      });
      expect(
        within(full).getByTestId<HTMLDetailsElement>('contract-details').open,
      ).toBe(true);
    });

    it('fills the form with the details of the debt and saves them all back', async () => {
      const user = renderPage();
      await screen.findByRole('list', { name: 'Crédits en cours' });
      await user.click(
        screen.getByRole('button', { name: 'Modifier Prêt maison' }),
      );
      const dialog = await screen.findByRole('dialog', {
        name: 'Modifier le crédit',
      });
      expect(within(dialog).getByLabelText('Prêteur (facultatif)')).toHaveValue(
        'Crédit Agricole',
      );
      expect(
        within(dialog).getByRole('button', { name: 'Fixe' }),
      ).toHaveAttribute('aria-pressed', 'true');
      expect(within(dialog).getByLabelText('Durée : années')).toHaveValue('20');
      expect(
        within(dialog).getByLabelText(
          'Comment l’assurance est-elle calculée ?',
        ),
      ).toHaveValue('PERCENT_INITIAL');
      expect(
        within(dialog).getByLabelText('Taux annuel de l’assurance'),
      ).toHaveValue('0,3');
      expect(within(dialog).getByLabelText('Quotité assurée')).toHaveValue(
        '200',
      );
      expect(within(dialog).getByLabelText('Référence du contrat')).toHaveValue(
        'PRET-12345',
      );
      expect(within(dialog).getByLabelText('Frais de dossier')).toHaveValue(
        '900',
      );
      expect(within(dialog).getByLabelText('Garantie')).toHaveValue('SURETY');
      expect(within(dialog).getByLabelText('Frais de garantie')).toHaveValue(
        '1500',
      );
      expect(within(dialog).getByLabelText('Notes')).toHaveValue(house.notes);
      await user.click(
        within(dialog).getByRole('button', { name: 'Enregistrer' }),
      );
      await waitFor(() =>
        expect(api.updateDebt).toHaveBeenCalledWith(
          's-common',
          'h1',
          expect.objectContaining({
            lender: 'Crédit Agricole',
            initialTermMonths: 240,
            rateType: 'FIXED',
            insuranceMode: 'PERCENT_INITIAL',
            insuranceRatePercent: 0.3,
            insuranceQuotityPercent: 200,
            feesCents: 90000,
            guaranteeKind: 'SURETY',
            guaranteeCents: 150000,
            archived: false,
          }),
        ),
      );
    });
  });
});
