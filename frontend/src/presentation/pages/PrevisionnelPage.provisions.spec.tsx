import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Forecast } from '../../domain/forecast';
import { Provisions } from '../../domain/provisions';
import { RecurringPayment } from '../../domain/recurring';
import { YearForecast } from '../../domain/year-forecast';
import { ApiError, NetworkError } from '../../infrastructure/api-client';
import { renderInApp } from '../../test/render-app';

const api = vi.hoisted(() => ({
  fetchForecast: vi.fn(),
  fetchRecurring: vi.fn(),
  createRecurring: vi.fn(),
  updateRecurring: vi.fn(),
  deleteRecurring: vi.fn(),
  fetchAidRules: vi.fn(),
  fetchAccounts: vi.fn(),
  fetchProvisions: vi.fn(),
  fetchYearForecast: vi.fn(),
  createTransaction: vi.fn(),
}));

vi.mock('../../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/api-client')>()),
  apiClient: api,
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'alice', email: 'alice@example.test', name: 'Alice' }, loading: false, logout: vi.fn() }),
}));

import { PrevisionnelPage } from './PrevisionnelPage';

const forecast: Forecast = {
  month: '2026-11',
  asOf: '2026-11-12T00:00:00.000Z',
  income: { plannedCents: 380000, actualCents: 380000, expectedRemainingCents: 0, projectedCents: 380000 },
  blocs: [],
  projectedBalanceCents: 260400,
  cautiousBalanceCents: 190400,
  occurrences: [],
};

const recurring: RecurringPayment[] = [
  {
    id: 'r1',
    spaceId: 's-common',
    kind: 'EXPENSE',
    bloc: 'FIXE',
    label: 'Taxe foncière',
    amountCents: 120000,
    dayOfMonth: 15,
    startDate: '2026-01-01',
    endDate: null,
    active: true,
    aidRuleId: null,
    frequency: 'YEARLY',
    monthOfYear: 10,
  },
];

const provisions: Provisions = {
  asOf: '2026-10-30',
  items: [
    {
      recurringId: 'r2',
      label: 'Vacances d’été',
      bloc: 'PLAISIR',
      frequency: 'YEARLY',
      amountCents: 240000,
      nextDueDate: '2027-07-20',
      monthsUntilDue: 8,
      monthlyProvisionCents: 20000,
      provisionedSoFarCents: null,
    },
    {
      recurringId: 'r1',
      label: 'Taxe foncière',
      bloc: 'FIXE',
      frequency: 'YEARLY',
      amountCents: 120000,
      nextDueDate: '2026-11-15',
      monthsUntilDue: 0,
      monthlyProvisionCents: 10000,
      provisionedSoFarCents: null,
    },
    {
      recurringId: 'r3',
      label: 'Eau',
      bloc: 'FIXE',
      frequency: 'QUARTERLY',
      amountCents: 9000,
      nextDueDate: '2027-02-05',
      monthsUntilDue: 3,
      monthlyProvisionCents: 3000,
      provisionedSoFarCents: null,
    },
  ],
  totalMonthlyProvisionCents: 33000,
  totalNextTwelveMonthsCents: 369000,
};

const monthEntry = (index: number, overrides: Partial<YearForecast['months'][number]> = {}): YearForecast['months'][number] => ({
  month: `2026-${String(index).padStart(2, '0')}`,
  incomeCents: 380000,
  expenseCents: 290000,
  balanceCents: 90000,
  cumulativeCents: 90000 * index,
  peak: false,
  items: [{ recurringId: 'loyer', label: 'Loyer', kind: 'EXPENSE', amountCents: 110000 }],
  ...overrides,
});

const yearForecast: YearForecast = {
  year: 2026,
  months: Array.from({ length: 12 }, (_, index) =>
    index === 9
      ? monthEntry(10, {
          expenseCents: 700000,
          balanceCents: -320000,
          cumulativeCents: 10000,
          peak: true,
          items: [
            { recurringId: 'salaire', label: 'Salaire', kind: 'INCOME', amountCents: 380000 },
            { recurringId: 'tf', label: 'Taxe foncière', kind: 'EXPENSE', amountCents: 120000 },
            { recurringId: 'loyer', label: 'Loyer', kind: 'EXPENSE', amountCents: 110000 },
            { recurringId: 'ass', label: 'Assurance auto', kind: 'EXPENSE', amountCents: 50000 },
            { recurringId: 'net', label: 'Internet', kind: 'EXPENSE', amountCents: 3000 },
          ],
        })
      : monthEntry(index + 1),
  ),
  totalIncomeCents: 4560000,
  totalExpenseCents: 3492000,
  provisionHintCents: 10000,
};

const renderPage = (path = '/previsionnel') => renderInApp(<PrevisionnelPage />, { path });

describe('PrevisionnelPage tabs', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchAccounts.mockResolvedValue([]);
    api.fetchForecast.mockResolvedValue(forecast);
    api.fetchRecurring.mockResolvedValue(recurring);
    api.fetchAidRules.mockResolvedValue([]);
    api.createRecurring.mockResolvedValue(recurring[0]);
    api.fetchProvisions.mockResolvedValue(provisions);
    api.fetchYearForecast.mockResolvedValue(yearForecast);
  });

  it('opens on « Ce mois-ci » and fetches nothing for the other views', async () => {
    renderPage();
    const tabs = screen.getByRole('tablist', { name: 'Vue du prévisionnel' });
    expect(within(tabs).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Ce mois-ci', 'Provisions', 'Mon année']);
    expect(within(tabs).getByRole('tab', { name: 'Ce mois-ci' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('region', { name: 'Soldes de fin de mois' })).toBeInTheDocument();
    expect(api.fetchProvisions).not.toHaveBeenCalled();
    expect(api.fetchYearForecast).not.toHaveBeenCalled();
  });

  it('switches views and moves with the arrow keys', async () => {
    const user = renderPage();
    await user.click(screen.getByRole('tab', { name: 'Provisions' }));
    expect(screen.getByRole('tab', { name: 'Provisions' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', screen.getByRole('tab', { name: 'Provisions' }).id);
    expect(screen.queryByRole('region', { name: 'Soldes de fin de mois' })).not.toBeInTheDocument();
    screen.getByRole('tab', { name: 'Provisions' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Mon année' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Mon année' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Ce mois-ci' })).toHaveAttribute('aria-selected', 'true');
  });

  it('opens straight on the provisions from a link', async () => {
    renderPage('/previsionnel?vue=provisions');
    expect(screen.getByRole('tab', { name: 'Provisions' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('region', { name: 'Prochaines échéances' })).toBeInTheDocument();
  });

  it('ignores an unknown view', async () => {
    renderPage('/previsionnel?vue=nimporte');
    expect(screen.getByRole('tab', { name: 'Ce mois-ci' })).toHaveAttribute('aria-selected', 'true');
    await screen.findByRole('region', { name: 'Soldes de fin de mois' });
  });

  describe('provisions', () => {
    const open = async () => {
      const user = renderPage('/previsionnel?vue=provisions');
      await screen.findByRole('region', { name: 'Prochaines échéances' });
      return user;
    };

    it('lists the non monthly payments by next due date with the monthly set-aside', async () => {
      await open();
      expect(api.fetchProvisions).toHaveBeenCalledWith('s-common');
      const items = screen.getAllByTestId('provision-item');
      expect(items.map((item) => within(item).getAllByText(/./)[0].textContent)).toEqual(['Taxe foncière', 'Eau', 'Vacances d’été']);
      expect(items[0]).toHaveTextContent(/− 1\s200,00\s€/);
      expect(items[0]).toHaveTextContent(/15 novembre 2026/);
      expect(items[0]).toHaveTextContent('ce mois-ci');
      expect(items[0]).toHaveTextContent('Chaque année');
      expect(items[0]).toHaveTextContent(/Mettre de côté 100,00\s€ par mois/);
      expect(items[1]).toHaveTextContent('dans 3 mois');
      expect(items[1]).toHaveTextContent('Chaque trimestre');
      expect(items[2]).toHaveTextContent('dans 8 mois');
      expect(items[2]).toHaveTextContent(/Mettre de côté 200,00\s€ par mois/);
    });

    it('shows the total to set aside, the 12-month total, the lesson and the plan link', async () => {
      await open();
      const summary = screen.getByRole('region', { name: 'À mettre de côté' });
      expect(summary).toHaveTextContent(/330,00\s€/);
      expect(summary).toHaveTextContent('3 paiements non mensuels');
      expect(summary).toHaveTextContent(/3\s690,00\s€ à payer dans les 12 prochains mois/);
      expect(summary).toHaveTextContent('leçon 2 du cours');
      expect(summary).toHaveTextContent('Leçon 2 du cours');
      expect(within(summary).getByRole('link', { name: 'Ajuster mon plan' })).toHaveAttribute('href', '/plan');
    });

    it('explains an empty state and offers to add a yearly payment', async () => {
      api.fetchProvisions.mockResolvedValue({ ...provisions, items: [], totalMonthlyProvisionCents: 0, totalNextTwelveMonthsCents: 0 });
      const user = await (async () => {
        const result = renderPage('/previsionnel?vue=provisions');
        await screen.findByText(/Aucun paiement non mensuel pour l’instant/);
        return result;
      })();
      expect(screen.getByRole('link', { name: 'Ajuster mon plan' })).toHaveAttribute('href', '/plan');
      await user.click(screen.getByRole('button', { name: 'Ajouter un paiement non mensuel' }));
      const dialog = await screen.findByRole('dialog', { name: 'Nouveau paiement récurrent' });
      expect(within(dialog).getByRole('button', { name: 'Chaque année' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('creates a yearly payment from the provisions view and refreshes the provisions', async () => {
      const user = await open();
      await user.click(screen.getAllByRole('button', { name: 'Ajouter un paiement non mensuel' })[0]);
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText('Libellé'), 'Assurance auto');
      await user.type(within(dialog).getByLabelText('Montant par an'), '600');
      await user.click(within(dialog).getByRole('button', { name: 'Ajouter le paiement' }));
      await waitFor(() =>
        expect(api.createRecurring).toHaveBeenCalledWith(
          's-common',
          expect.objectContaining({ label: 'Assurance auto', amountCents: 60000, frequency: 'YEARLY', monthOfYear: expect.any(Number) }),
        ),
      );
      await waitFor(() => expect(api.fetchProvisions).toHaveBeenCalledTimes(2));
    });

    it('offers a retry when it fails, and reports being offline', async () => {
      api.fetchProvisions.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValue(provisions);
      const user = renderPage('/previsionnel?vue=provisions');
      expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de calculer les provisions');
      await user.click(screen.getByRole('button', { name: 'Réessayer' }));
      expect(await screen.findByRole('region', { name: 'Prochaines échéances' })).toBeInTheDocument();
    });

    it('reports being offline', async () => {
      api.fetchProvisions.mockRejectedValue(new NetworkError());
      renderPage('/previsionnel?vue=provisions');
      expect(await screen.findByText(/Hors ligne : les provisions reviendront avec le réseau/)).toBeInTheDocument();
    });
  });

  describe('my year', () => {
    const open = async () => {
      const user = renderPage('/previsionnel?vue=annee');
      await screen.findByRole('region', { name: 'Mois par mois' });
      return user;
    };

    it('loads the year of the selected month', async () => {
      await open();
      expect(api.fetchYearForecast).toHaveBeenCalledWith('s-common', 2026);
      expect(screen.getByRole('heading', { name: '2026' })).toBeInTheDocument();
    });

    it('lists the 12 months with income, expenses, balance and running total', async () => {
      await open();
      const rows = screen.getAllByTestId('year-month');
      expect(rows).toHaveLength(12);
      expect(rows[0]).toHaveTextContent('Janvier');
      expect(rows[0]).toHaveTextContent(/Revenus\s*3\s800,00\s€/);
      expect(rows[0]).toHaveTextContent(/Dépenses\s*2\s900,00\s€/);
      expect(rows[0]).toHaveTextContent(/Solde du mois : \+ 900,00\s€/);
      expect(rows[1]).toHaveTextContent(/Cumul\s*\+ 1\s800,00\s€/);
    });

    it('highlights the peak month with its biggest expenses, in words and not only in colour', async () => {
      await open();
      const peaks = screen.getAllByTestId('year-month').filter((row) => row.getAttribute('data-peak') === 'true');
      expect(peaks).toHaveLength(1);
      expect(peaks[0]).toHaveTextContent('Octobre');
      expect(peaks[0]).toHaveTextContent('Mois pic');
      expect(peaks[0]).toHaveTextContent(/Solde du mois : - 3\s200,00\s€/);
      const lines = within(peaks[0]).getAllByRole('listitem').map((line) => line.textContent);
      expect(lines).toHaveLength(3);
      expect(lines[0]).toMatch(/^Taxe foncière.*1\s200,00\s€$/);
      expect(lines[1]).toMatch(/^Loyer/);
      expect(lines[2]).toMatch(/^Assurance auto/);
      expect(peaks[0]).toHaveTextContent('et 1 autre paiement');
      expect(peaks[0]).not.toHaveTextContent('Salaire');
      const calm = screen.getAllByTestId('year-month')[0];
      expect(calm).not.toHaveTextContent('Mois pic');
      expect(within(calm).queryByText('Les plus gros paiements')).not.toBeInTheDocument();
    });

    it('shows the yearly totals and the provision hint', async () => {
      await open();
      const totals = screen.getByRole('region', { name: 'Totaux 2026' });
      expect(totals).toHaveTextContent(/Revenus\s*45\s600,00\s€/);
      expect(totals).toHaveTextContent(/Dépenses\s*34\s920,00\s€/);
      expect(totals).toHaveTextContent(/Solde de l’année\s*\+ 10\s680,00\s€/);
      expect(totals).toHaveTextContent(/Mettre de côté environ 100,00\s€ par mois/);
      expect(within(totals).getByRole('link', { name: 'Voir mes provisions' })).toHaveAttribute('href', '/previsionnel?vue=provisions');
      expect(totals).toHaveTextContent(/Un mois sort du lot : octobre/);
    });

    it('draws a histogram with a text alternative and a marked peak', async () => {
      await open();
      const chart = screen.getByRole('img', { name: /Dépenses prévues par mois en 2026/ });
      expect(chart).toHaveAccessibleName(/octobre 7\s000,00\s€/);
      expect(chart).toHaveAccessibleName(/Mois pics : octobre\./);
      const bars = screen.getAllByTestId('year-bar');
      expect(bars).toHaveLength(12);
      expect(bars[9]).toHaveAttribute('data-peak', 'true');
      expect(bars[9]).toHaveTextContent('▲');
      expect(bars[0]).not.toHaveTextContent('▲');
      expect(screen.getByText(/Barre rayée avec ▲ : mois « pic »/)).toBeInTheDocument();
    });

    it('does not show the provision hint when there is none', async () => {
      api.fetchYearForecast.mockResolvedValue({ ...yearForecast, provisionHintCents: 0 });
      await open();
      expect(screen.queryByText(/Mettre de côté environ/)).not.toBeInTheDocument();
    });

    it('changes year', async () => {
      const user = await open();
      await user.click(screen.getByRole('button', { name: 'Année suivante' }));
      expect(await screen.findByRole('heading', { name: '2027' })).toBeInTheDocument();
      await waitFor(() => expect(api.fetchYearForecast).toHaveBeenLastCalledWith('s-common', 2027));
      await user.click(screen.getByRole('button', { name: 'Année précédente' }));
      await user.click(screen.getByRole('button', { name: 'Année précédente' }));
      await waitFor(() => expect(api.fetchYearForecast).toHaveBeenLastCalledWith('s-common', 2025));
    });

    it('explains an empty year', async () => {
      api.fetchYearForecast.mockResolvedValue({ year: 2026, months: [], totalIncomeCents: 0, totalExpenseCents: 0, provisionHintCents: 0 });
      renderPage('/previsionnel?vue=annee');
      expect(await screen.findByText(/Rien à afficher pour 2026/)).toBeInTheDocument();
    });

    it('offers a retry when it fails', async () => {
      api.fetchYearForecast.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValue(yearForecast);
      const user = renderPage('/previsionnel?vue=annee');
      expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de calculer la vue de l’année');
      await user.click(screen.getByRole('button', { name: 'Réessayer' }));
      expect(await screen.findByRole('region', { name: 'Mois par mois' })).toBeInTheDocument();
    });

    it('reports being offline', async () => {
      api.fetchYearForecast.mockRejectedValue(new NetworkError());
      renderPage('/previsionnel?vue=annee');
      expect(await screen.findByText(/Hors ligne : la vue de l’année reviendra avec le réseau/)).toBeInTheDocument();
    });

    it('does not break on a response without frequency fields or odd months', async () => {
      api.fetchYearForecast.mockResolvedValue({ year: 2026, months: [{ month: '2026-01' }] } as unknown as YearForecast);
      renderPage('/previsionnel?vue=annee');
      expect(await screen.findByRole('region', { name: 'Mois par mois' })).toBeInTheDocument();
    });
  });

  it('keeps editing a recurring payment from the monthly view with its frequency', async () => {
    const user = renderPage();
    const list = await screen.findByRole('region', { name: 'Paiements récurrents' });
    expect(list).toHaveTextContent('Tous les ans en octobre, le 15');
    await user.click(screen.getByRole('button', { name: 'Modifier Taxe foncière' }));
    const dialog = await screen.findByRole('dialog', { name: 'Modifier le paiement' });
    expect(within(dialog).getByLabelText('Mois de l’année')).toHaveValue('10');
    fireEvent.change(within(dialog).getByLabelText('Mois de l’année'), { target: { value: '11' } });
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(api.updateRecurring).toHaveBeenCalledWith('s-common', 'r1', expect.objectContaining({ frequency: 'YEARLY', monthOfYear: 11, amountCents: 120000 })),
    );
  });
});
