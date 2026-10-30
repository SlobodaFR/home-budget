import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AidRule } from '../../domain/aids';
import { Forecast } from '../../domain/forecast';
import { RecurringPayment } from '../../domain/recurring';
import { ApiError, NetworkError } from '../../infrastructure/api-client';
import { account } from '../../test/fixtures';
import { renderInApp } from '../../test/render-app';

const api = vi.hoisted(() => ({
  fetchForecast: vi.fn(),
  fetchRecurring: vi.fn(),
  createRecurring: vi.fn(),
  updateRecurring: vi.fn(),
  deleteRecurring: vi.fn(),
  fetchAidRules: vi.fn(),
  createTransaction: vi.fn(),
  fetchAccounts: vi.fn(),
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
  blocs: [
    { bloc: 'FIXE', plannedCents: 175000, actualCents: 110000, expectedRemainingCents: 9600, projectedCents: 119600 },
    { bloc: 'COURANT', plannedCents: 100000, actualCents: 20000, expectedRemainingCents: 0, projectedCents: 20000 },
    { bloc: 'PLAISIR', plannedCents: 45000, actualCents: 0, expectedRemainingCents: 5000, projectedCents: 50000 },
    { bloc: 'EPARGNE', plannedCents: 20000, actualCents: 0, expectedRemainingCents: 0, projectedCents: 0 },
  ],
  projectedBalanceCents: 260400,
  cautiousBalanceCents: 190400,
  occurrences: [
    { recurringId: 'r1', label: 'Loyer', kind: 'EXPENSE', bloc: 'FIXE', amountCents: 110000, date: '2026-11-05T00:00:00.000Z', estimated: false, status: 'PAID' },
    { recurringId: 'r2', label: 'Assurance', kind: 'EXPENSE', bloc: 'FIXE', amountCents: 5000, date: '2026-11-08T00:00:00.000Z', estimated: false, status: 'MISSING' },
    { recurringId: 'r3', label: 'Netflix', kind: 'EXPENSE', bloc: 'PLAISIR', amountCents: 1500, date: '2026-11-30T00:00:00.000Z', estimated: true, status: 'DUE' },
  ],
};

const recurring: RecurringPayment[] = [
  {
    id: 'r1',
    spaceId: 's-common',
    kind: 'EXPENSE',
    bloc: 'FIXE',
    label: 'Loyer',
    amountCents: 110000,
    dayOfMonth: 5,
    startDate: '2026-01-01',
    endDate: null,
    active: true,
    aidRuleId: null,
  },
  {
    id: 'r4',
    spaceId: 's-common',
    kind: 'EXPENSE',
    bloc: 'COURANT',
    label: 'Femme de ménage',
    amountCents: 10000,
    dayOfMonth: null,
    startDate: '2026-01-01',
    endDate: null,
    active: true,
    aidRuleId: 'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE',
  },
];

const aidRules: AidRule[] = [
  {
    id: 'CREDIT_IMPOT_GARDE_HORS_DOMICILE',
    label: 'Garde d’enfants de moins de 6 ans hors du domicile',
    description: 'Crèche…',
    ratePercent: 50,
    capDescription: '3 500 € de frais par enfant de moins de 6 ans',
    cashTiming: 'L’été suivant',
    sourceLabel: 'impots.gouv.fr',
    sourceUrl: 'https://www.impots.gouv.fr/x',
    verifiedOn: '2026-10-30',
  },
  {
    id: 'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE',
    label: 'Services à la personne à domicile',
    description: 'Ménage…',
    ratePercent: 50,
    capDescription: '12 000 € de dépenses par an (plafond relevé selon la situation)',
    cashTiming: 'L’été suivant',
    sourceLabel: 'impots.gouv.fr',
    sourceUrl: 'https://www.impots.gouv.fr/y',
    verifiedOn: '2026-10-30',
  },
];

const renderPage = (kind: 'COMMON' | 'PERSONAL' = 'COMMON') => renderInApp(<PrevisionnelPage />, { path: '/previsionnel', kind });

describe('PrevisionnelPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchAccounts.mockResolvedValue([]);
    api.fetchForecast.mockResolvedValue(forecast);
    api.fetchRecurring.mockResolvedValue(recurring);
    api.fetchAidRules.mockResolvedValue(aidRules);
    api.createRecurring.mockResolvedValue(recurring[0]);
    api.updateRecurring.mockResolvedValue(undefined);
    api.deleteRecurring.mockResolvedValue(undefined);
  });

  describe('forecast', () => {
    it('shows the projected and cautious balances with a one-sentence difference', async () => {
      renderPage();
      const hero = await screen.findByRole('region', { name: 'Soldes de fin de mois' });
      expect(hero).toHaveTextContent(/Solde projeté\s*2\s?604,00\s€/);
      expect(hero).toHaveTextContent(/Solde prudent\s*1\s?904,00\s€/);
      expect(hero).toHaveTextContent(/prudent est\s+700,00\s€ plus bas/);
      expect(api.fetchForecast).toHaveBeenCalledWith('s-common', '2026-11');
    });

    it('shows planned, actual, expected remaining and projected for the income and the 4 blocs', async () => {
      renderPage();
      const blocs = await screen.findByRole('region', { name: 'Prévu, réel et projeté' });
      const items = within(blocs).getAllByRole('listitem');
      expect(items).toHaveLength(5);
      const fixe = items[1];
      expect(fixe).toHaveTextContent('Fixe');
      expect(fixe).toHaveTextContent(/Prévu\s*1\s?750,00\s€/);
      expect(fixe).toHaveTextContent(/Réel\s*1\s?100,00\s€/);
      expect(fixe).toHaveTextContent(/Restant attendu\s*96,00\s€/);
      expect(fixe).toHaveTextContent(/Projeté\s*1\s?196,00\s€/);
      expect(items[3]).toHaveTextContent(/Dépasserait le prévu de\s+50,00\s€/);
      expect(items[4]).toHaveTextContent(/sous l’objectif d’épargne/);
    });

    it('highlights a missing payment and points to the import', async () => {
      renderPage();
      const section = await screen.findByRole('region', { name: 'Paiements attendus ce mois-ci' });
      const rows = within(section).getAllByRole('listitem');
      expect(rows.map((row) => row.getAttribute('data-status'))).toEqual(['PAID', 'MISSING', 'DUE']);
      expect(rows[1]).toHaveTextContent('Non retrouvé');
      expect(rows[1]).toHaveTextContent('Attendu mais non retrouvé — importez votre relevé');
      expect(within(rows[1]).getByRole('link', { name: 'importez votre relevé' })).toHaveAttribute('href', '/import');
      expect(rows[0]).toHaveTextContent('Retrouvé');
      expect(rows[2]).toHaveTextContent('À venir');
      expect(rows[2]).toHaveTextContent('date estimée');
      expect(within(section).getByRole('status')).toHaveTextContent('1 paiement est attendu mais non retrouvé');
      expect(within(section).getByRole('link', { name: 'Importer mon relevé' })).toHaveAttribute('href', '/import');
    });

    it('shows no banner when nothing is missing', async () => {
      api.fetchForecast.mockResolvedValue({ ...forecast, occurrences: forecast.occurrences.filter((item) => item.status !== 'MISSING') });
      renderPage();
      const section = await screen.findByRole('region', { name: 'Paiements attendus ce mois-ci' });
      expect(within(section).queryByRole('status')).not.toBeInTheDocument();
    });

    it('explains an empty month', async () => {
      api.fetchForecast.mockResolvedValue({ ...forecast, occurrences: [] });
      renderPage();
      expect(await screen.findByText(/Aucun paiement récurrent n’est prévu ce mois-ci/)).toBeInTheDocument();
    });

    it('offers a retry when the forecast fails', async () => {
      api.fetchForecast.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValue(forecast);
      const user = renderPage();
      expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de calculer le prévisionnel');
      await user.click(screen.getByRole('button', { name: 'Réessayer' }));
      expect(await screen.findByRole('region', { name: 'Soldes de fin de mois' })).toBeInTheDocument();
    });

    it('reports being offline', async () => {
      api.fetchForecast.mockRejectedValue(new NetworkError());
      renderPage();
      expect(await screen.findByText(/Hors ligne : le prévisionnel reviendra avec le réseau/)).toBeInTheDocument();
    });
  });

  describe('recurring payments', () => {
    const list = () => screen.findByRole('region', { name: 'Paiements récurrents' });

    it('lists the payments with schedule and aid', async () => {
      renderPage();
      const section = await list();
      expect(section).toHaveTextContent('Loyer');
      expect(section).toHaveTextContent('Le 5 de chaque mois');
      expect(section).toHaveTextContent('Jour inconnu : compté en fin de mois');
      expect(section).toHaveTextContent('Aide : Services à la personne à domicile');
    });

    it('adds a common expense with an official aid', async () => {
      const user = renderPage();
      await list();
      await user.click(screen.getByRole('button', { name: /Ajouter/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Nouveau paiement récurrent' });
      await user.click(within(dialog).getByRole('button', { name: 'Courant' }));
      await user.type(within(dialog).getByLabelText('Libellé'), 'Crèche Les Petits');
      await user.type(within(dialog).getByLabelText('Montant par mois'), '650,40');
      await user.type(within(dialog).getByLabelText(/Jour du mois/), '3');
      fireEvent.change(within(dialog).getByLabelText('Début'), { target: { value: '2026-09-01' } });
      fireEvent.change(within(dialog).getByLabelText(/Fin/), { target: { value: '2027-07-31' } });
      const select = within(dialog).getByLabelText('Aide officielle');
      expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
        'Aucune',
        'Garde d’enfants de moins de 6 ans hors du domicile',
        'Services à la personne à domicile',
      ]);
      await user.selectOptions(select, 'CREDIT_IMPOT_GARDE_HORS_DOMICILE');
      expect(within(dialog).getByText(/3 500 € de frais par enfant de moins de 6 ans/)).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Ajouter le paiement' }));

      await waitFor(() =>
        expect(api.createRecurring).toHaveBeenCalledWith('s-common', {
          kind: 'EXPENSE',
          bloc: 'COURANT',
          label: 'Crèche Les Petits',
          amountCents: 65040,
          dayOfMonth: 3,
          startDate: '2026-09-01',
          endDate: '2027-07-31',
          active: true,
          aidRuleId: 'CREDIT_IMPOT_GARDE_HORS_DOMICILE',
        }),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      // la liste et le prévisionnel sont rechargés
      await waitFor(() => expect(api.fetchRecurring).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(api.fetchForecast).toHaveBeenCalledTimes(2));
    });

    it('hides the aid selector for an income', async () => {
      const user = renderPage();
      await list();
      await user.click(screen.getByRole('button', { name: /Ajouter/ }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByLabelText('Aide officielle')).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Revenu' }));
      expect(within(dialog).queryByLabelText('Aide officielle')).not.toBeInTheDocument();
      expect(within(dialog).queryByRole('group', { name: 'Bloc' })).not.toBeInTheDocument();
      await user.type(within(dialog).getByLabelText('Libellé'), 'Salaire');
      await user.type(within(dialog).getByLabelText('Montant par mois'), '2000');
      await user.click(within(dialog).getByRole('button', { name: 'Ajouter le paiement' }));
      await waitFor(() =>
        expect(api.createRecurring).toHaveBeenCalledWith(
          's-common',
          expect.objectContaining({ kind: 'INCOME', label: 'Salaire', amountCents: 200000, aidRuleId: null }),
        ),
      );
      expect(api.createRecurring.mock.calls[0][1]).not.toHaveProperty('bloc');
    });

    it('offers no aid at all in the personal space', async () => {
      api.fetchRecurring.mockResolvedValue([{ ...recurring[0], spaceId: 's-alice' }]);
      const user = renderPage('PERSONAL');
      await list();
      await user.click(screen.getByRole('button', { name: /Ajouter/ }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).queryByLabelText('Aide officielle')).not.toBeInTheDocument();
      expect(api.fetchAidRules).not.toHaveBeenCalled();
      expect(screen.queryByRole('link', { name: /Voir mes aides/ })).not.toBeInTheDocument();
      await user.type(within(dialog).getByLabelText('Libellé'), 'Salle de sport');
      await user.type(within(dialog).getByLabelText('Montant par mois'), '30');
      await user.click(within(dialog).getByRole('button', { name: 'Ajouter le paiement' }));
      await waitFor(() => expect(api.createRecurring).toHaveBeenCalledTimes(1));
      expect(api.createRecurring.mock.calls[0][0]).toBe('s-alice');
      expect(api.createRecurring.mock.calls[0][1]).not.toHaveProperty('aidRuleId');
    });

    it('keeps the aid when the catalogue is unavailable while editing', async () => {
      api.fetchAidRules.mockRejectedValue(new ApiError(500, 'boom'));
      const user = renderPage();
      await list();
      await user.click(screen.getByRole('button', { name: 'Modifier Femme de ménage' }));
      const dialog = await screen.findByRole('dialog', { name: 'Modifier le paiement' });
      expect(within(dialog).queryByLabelText('Aide officielle')).not.toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
      await waitFor(() =>
        expect(api.updateRecurring).toHaveBeenCalledWith(
          's-common',
          'r4',
          expect.objectContaining({ aidRuleId: 'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE', amountCents: 10000, dayOfMonth: null }),
        ),
      );
    });

    it('validates the form before calling the API', async () => {
      const user = renderPage();
      await list();
      await user.click(screen.getByRole('button', { name: /Ajouter/ }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText(/Jour du mois/), '45');
      await user.click(within(dialog).getByRole('button', { name: 'Ajouter le paiement' }));
      expect(within(dialog).getByText('Donnez un nom à ce paiement (ex. Loyer).')).toBeInTheDocument();
      expect(within(dialog).getByText('Saisissez un montant.')).toBeInTheDocument();
      expect(within(dialog).getByText(/entre 1 et 31/)).toBeInTheDocument();
      expect(api.createRecurring).not.toHaveBeenCalled();
    });

    it('pauses a payment with its full payload and reloads the forecast', async () => {
      const user = renderPage();
      await list();
      await user.click(screen.getByRole('switch', { name: 'Mettre en pause Loyer' }));
      await waitFor(() =>
        expect(api.updateRecurring).toHaveBeenCalledWith('s-common', 'r1', {
          kind: 'EXPENSE',
          bloc: 'FIXE',
          label: 'Loyer',
          amountCents: 110000,
          dayOfMonth: 5,
          startDate: '2026-01-01',
          endDate: null,
          active: false,
        }),
      );
      await waitFor(() => expect(api.fetchForecast).toHaveBeenCalledTimes(2));
    });

    it('asks for confirmation before deleting', async () => {
      const user = renderPage();
      await list();
      await user.click(screen.getByRole('button', { name: 'Supprimer Loyer' }));
      expect(api.deleteRecurring).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Supprimer' }));
      await waitFor(() => expect(api.deleteRecurring).toHaveBeenCalledWith('s-common', 'r1'));
    });

    it('shows a server error inside the form and keeps it open', async () => {
      api.createRecurring.mockRejectedValue(new ApiError(400, 'invalide'));
      const user = renderPage();
      await list();
      await user.click(screen.getByRole('button', { name: /Ajouter/ }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText('Libellé'), 'Loyer');
      await user.type(within(dialog).getByLabelText('Montant par mois'), '100');
      await user.click(within(dialog).getByRole('button', { name: 'Ajouter le paiement' }));
      expect(await within(dialog).findByText(/L’enregistrement a échoué/)).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});

describe('PrevisionnelPage and bank accounts', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchForecast.mockResolvedValue(forecast);
    api.fetchRecurring.mockResolvedValue(recurring);
    api.fetchAidRules.mockResolvedValue(aidRules);
    api.createRecurring.mockResolvedValue(recurring[0]);
    api.updateRecurring.mockResolvedValue(undefined);
    api.fetchAccounts.mockResolvedValue([
      account({ id: 'a1', name: 'Compte commun' }),
      account({ id: 'a2', name: 'Livret A', kind: 'SAVINGS' }),
      account({ id: 'a3', name: 'Ancien', archived: true }),
    ]);
  });

  it('says contributions are assumed paid when the forecast says so', async () => {
    api.fetchForecast.mockResolvedValue({ ...forecast, income: { ...forecast.income, contributionAssumed: true } });
    renderPage();
    const blocs = await screen.findByRole('region', { name: 'Prévu, réel et projeté' });
    expect(blocs).toHaveTextContent('Les contributions de chacun sont supposées versées.');
  });

  it('does not say it otherwise', async () => {
    api.fetchForecast.mockResolvedValue({ ...forecast, income: { ...forecast.income, contributionAssumed: false } });
    renderPage();
    const blocs = await screen.findByRole('region', { name: 'Prévu, réel et projeté' });
    expect(blocs).not.toHaveTextContent('supposées versées');
  });

  it('lets you attach a new recurring payment to an account, in the personal space too', async () => {
    const user = renderPage('PERSONAL');
    await screen.findByRole('region', { name: 'Paiements récurrents' });
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    const dialog = await screen.findByRole('dialog');
    const select = within(dialog).getByLabelText('Compte (facultatif)') as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual(['Aucun', 'Compte commun', 'Livret A']);
    await user.selectOptions(select, 'a2');
    await user.type(within(dialog).getByLabelText('Libellé'), 'Salle de sport');
    await user.type(within(dialog).getByLabelText('Montant par mois'), '30');
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter le paiement' }));
    await waitFor(() => expect(api.createRecurring).toHaveBeenCalledWith('s-alice', expect.objectContaining({ accountId: 'a2' })));
  });

  it('sends an explicit null when no account is chosen', async () => {
    const user = renderPage();
    await screen.findByRole('region', { name: 'Paiements récurrents' });
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Libellé'), 'Loyer');
    await user.type(within(dialog).getByLabelText('Montant par mois'), '900');
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter le paiement' }));
    await waitFor(() => expect(api.createRecurring).toHaveBeenCalled());
    expect(api.createRecurring.mock.calls[0][1].accountId).toBeNull();
  });

  it('preselects the last account chosen in the space and remembers the new choice', async () => {
    window.localStorage.setItem('foyer-budget:last-account:s-common', 'a1');
    const user = renderPage();
    await screen.findByRole('region', { name: 'Paiements récurrents' });
    await waitFor(() => expect(api.fetchAccounts).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByLabelText('Compte (facultatif)')).toHaveValue('a1'));
    await user.selectOptions(within(dialog).getByLabelText('Compte (facultatif)'), 'a2');
    await user.type(within(dialog).getByLabelText('Libellé'), 'Épargne');
    await user.type(within(dialog).getByLabelText('Montant par mois'), '50');
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter le paiement' }));
    await waitFor(() => expect(api.createRecurring).toHaveBeenCalled());
    expect(window.localStorage.getItem('foyer-budget:last-account:s-common')).toBe('a2');
  });

  it('shows no selector when the space has no account', async () => {
    api.fetchAccounts.mockResolvedValue([]);
    const user = renderPage();
    await screen.findByRole('region', { name: 'Paiements récurrents' });
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText('Compte (facultatif)')).not.toBeInTheDocument();
  });

  it('keeps the account when a payment is paused', async () => {
    api.fetchRecurring.mockResolvedValue([{ ...recurring[0], accountId: 'a1' }]);
    const user = renderPage();
    await screen.findByRole('region', { name: 'Paiements récurrents' });
    expect(screen.getByRole('region', { name: 'Paiements récurrents' })).toHaveTextContent('Compte commun');
    await user.click(screen.getByRole('switch', { name: 'Mettre en pause Loyer' }));
    await waitFor(() => expect(api.updateRecurring).toHaveBeenCalledWith('s-common', 'r1', expect.objectContaining({ accountId: 'a1', active: false })));
  });
});
