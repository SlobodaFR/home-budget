import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AidsSummary, CrecheEstimate } from '../../domain/aids';
import { ApiError } from '../../infrastructure/api-client';
import { renderInApp } from '../../test/render-app';

const api = vi.hoisted(() => ({
  fetchAids: vi.fn(),
  fetchFiscalProfile: vi.fn(),
  saveFiscalProfile: vi.fn(),
  fetchCrecheEstimate: vi.fn(),
  createTransaction: vi.fn(),
}));

vi.mock('../../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/api-client')>()),
  apiClient: api,
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'alice', email: 'alice@example.test', name: 'Alice' }, loading: false, logout: vi.fn() }),
}));

import { AidesPage } from './AidesPage';

const aids: AidsSummary = {
  year: 2026,
  profileMissing: false,
  totalExpectedCreditCents: 60000,
  rules: [
    {
      ruleId: 'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE',
      label: 'Services à la personne à domicile',
      ratePercent: 50,
      spentCents: 120000,
      capCents: 1500000,
      eligibleCents: 120000,
      expectedCreditCents: 60000,
      capReached: false,
      cashTiming: 'Versé l’été de l’année suivante, après la déclaration de revenus.',
      sourceUrl: 'https://www.impots.gouv.fr/particulier/questions/services',
      verifiedOn: '2026-10-30',
      lines: [{ recurringId: 'r4', label: 'Femme de ménage', yearlySpentCents: 120000, monthlyCents: 10000, netMonthlyCents: 5000 }],
    },
  ],
};

const estimate: CrecheEstimate = {
  kind: 'COLLECTIVE',
  effortRatePercent: 0.0619,
  monthlyResourcesUsedCents: 520000,
  hourlyRateCents: 322,
  monthlyBillCents: 45080,
  floorCents: 81462,
  ceilingCents: 850000,
  ceilingApplied: false,
  floorApplied: false,
  verifiedOn: '2026-10-30',
  sourceUrl: 'https://www.caf.fr/partenaires/bareme',
};

const renderPage = () => renderInApp(<AidesPage />, { path: '/aides' });

describe('AidesPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchAids.mockResolvedValue(aids);
    api.fetchFiscalProfile.mockResolvedValue({ childrenUnderSix: 1, dependentChildren: 3, firstYearHomeServices: false });
    api.saveFiscalProfile.mockResolvedValue(undefined);
    api.fetchCrecheEstimate.mockResolvedValue(estimate);
  });

  it('always states that these are estimates, not tax advice', async () => {
    renderPage();
    expect(await screen.findByText('Estimation, pas un conseil fiscal.')).toBeInTheDocument();
  });

  describe('yearly summary', () => {
    it('shows spent, cap and expected credit with the net monthly cost, timing and a safe source link', async () => {
      renderPage();
      const summary = await screen.findByRole('region', { name: 'Aides 2026' });
      expect(api.fetchAids).toHaveBeenCalledWith('s-common', new Date().getFullYear());
      expect(summary).toHaveTextContent(/Crédit d’impôt attendu en 2026\s*600,00\s€/);
      expect(summary).toHaveTextContent(/Dépensé\s*1\s?200,00\s€/);
      expect(summary).toHaveTextContent(/Plafond\s*15\s?000,00\s€/);
      expect(summary).toHaveTextContent(/Crédit attendu\s*600,00\s€/);
      expect(summary).toHaveTextContent(/Il reste\s+13\s?800,00\s€ de dépenses avant le plafond/);
      expect(summary).toHaveTextContent(/Femme de ménage/);
      expect(summary).toHaveTextContent(/100,00\s€ par mois, soit\s+50,00\s€ une fois l’aide reçue/);
      expect(summary).toHaveTextContent('Quand l’argent revient : Versé l’été de l’année suivante');
      const link = within(summary).getByRole('link', { name: 'impots.gouv.fr' });
      expect(link).toHaveAttribute('href', 'https://www.impots.gouv.fr/particulier/questions/services');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
      expect(summary).toHaveTextContent('vérifié le 30 octobre 2026');
      expect(screen.queryByText('Votre profil fiscal n’est pas rempli.')).not.toBeInTheDocument();
    });

    it('flags a reached cap', async () => {
      api.fetchAids.mockResolvedValue({
        ...aids,
        rules: [{ ...aids.rules[0], spentCents: 1600000, eligibleCents: 1500000, capReached: true }],
      });
      renderPage();
      expect(await screen.findByText(/Plafond atteint : 1\s?000,00\s€ de dépenses au-delà/)).toBeInTheDocument();
    });

    it('never links to a non-http source', async () => {
      api.fetchAids.mockResolvedValue({ ...aids, rules: [{ ...aids.rules[0], sourceUrl: 'javascript:alert(1)' }] });
      renderPage();
      const summary = await screen.findByRole('region', { name: 'Aides 2026' });
      expect(within(summary).queryByRole('link')).not.toBeInTheDocument();
    });

    it('shows a banner when the fiscal profile is missing', async () => {
      api.fetchAids.mockResolvedValue({ ...aids, profileMissing: true });
      api.fetchFiscalProfile.mockResolvedValue(null);
      renderPage();
      expect(await screen.findByText('Votre profil fiscal n’est pas rempli.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Remplir mon profil' })).toHaveAttribute('href', '#profil-fiscal');
    });

    it('explains how to attach a payment when no rule has a line', async () => {
      api.fetchAids.mockResolvedValue({ ...aids, rules: [], totalExpectedCreditCents: 0 });
      renderPage();
      expect(await screen.findByText(/Aucune dépense n’est rattachée à une aide pour 2026/)).toBeInTheDocument();
    });

    it('changes the year', async () => {
      const user = renderPage();
      await screen.findByRole('region', { name: 'Aides 2026' });
      await user.click(screen.getByRole('button', { name: 'Année précédente' }));
      await waitFor(() => expect(api.fetchAids).toHaveBeenLastCalledWith('s-common', new Date().getFullYear() - 1));
    });

    it('offers a retry on error', async () => {
      api.fetchAids.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValue(aids);
      const user = renderPage();
      expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger le récapitulatif des aides');
      await user.click(screen.getByRole('button', { name: 'Réessayer' }));
      expect(await screen.findByRole('region', { name: 'Aides 2026' })).toBeInTheDocument();
    });
  });

  describe('fiscal profile', () => {
    it('is prefilled and saved, then the summary is recomputed', async () => {
      const user = renderPage();
      const under6 = await screen.findByLabelText('Enfants de moins de 6 ans');
      expect(under6).toHaveValue('1');
      expect(screen.getByLabelText('Enfants à charge du foyer fiscal')).toHaveValue('3');
      await user.clear(under6);
      await user.type(under6, '2');
      await user.click(screen.getByRole('checkbox', { name: /première année/ }));
      await user.click(screen.getByRole('button', { name: 'Enregistrer le profil' }));
      await waitFor(() =>
        expect(api.saveFiscalProfile).toHaveBeenCalledWith({ childrenUnderSix: 2, dependentChildren: 3, firstYearHomeServices: true }),
      );
      await waitFor(() => expect(api.fetchAids).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(api.fetchFiscalProfile).toHaveBeenCalledTimes(2));
    });

    it('starts at zero children when nothing is declared', async () => {
      api.fetchFiscalProfile.mockResolvedValue(null);
      renderPage();
      expect(await screen.findByLabelText('Enfants de moins de 6 ans')).toHaveValue('0');
    });

    it('rejects a wrong number of children without calling the API', async () => {
      const user = renderPage();
      const under6 = await screen.findByLabelText('Enfants de moins de 6 ans');
      await user.clear(under6);
      await user.type(under6, '11');
      await user.click(screen.getByRole('button', { name: 'Enregistrer le profil' }));
      expect(screen.getByText('Indiquez un nombre entier entre 0 et 10.')).toBeInTheDocument();
      expect(api.saveFiscalProfile).not.toHaveBeenCalled();
    });

    it('shows a message when saving fails', async () => {
      api.saveFiscalProfile.mockRejectedValue(new ApiError(500, 'boom'));
      const user = renderPage();
      await screen.findByLabelText('Enfants de moins de 6 ans');
      await user.click(screen.getByRole('button', { name: 'Enregistrer le profil' }));
      expect(await screen.findByText('Enregistrement impossible, réessayez.')).toBeInTheDocument();
    });
  });

  describe('creche estimator', () => {
    const fill = async (user: ReturnType<typeof renderPage>, resources = '62 400', children = '2', hours = '140') => {
      await user.type(await screen.findByLabelText('Revenus annuels de l’année N-2'), resources);
      const childrenInput = screen.getByLabelText('Nombre d’enfants à charge');
      await user.clear(childrenInput);
      await user.type(childrenInput, children);
      await user.type(screen.getByLabelText('Heures facturées par mois'), hours);
    };

    it('sends annual resources in cents and shows the monthly bill, hourly rate and source', async () => {
      const user = renderPage();
      await fill(user);
      await user.click(screen.getByRole('button', { name: 'Estimer le tarif' }));
      const result = await screen.findByRole('status', { name: 'Résultat de l’estimation' });
      expect(api.fetchCrecheEstimate).toHaveBeenCalledWith({ annualResourcesCents: 6240000, children: 2, hoursPerMonth: 140, kind: 'COLLECTIVE' });
      expect(result).toHaveTextContent(/Facture mensuelle estimée\s*450,80\s€/);
      expect(result).toHaveTextContent(/Tarif horaire\s*3,22\s€/);
      expect(result).toHaveTextContent(/Taux d’effort\s*0,0619\s%/);
      expect(within(result).getByRole('link', { name: 'caf.fr' })).toHaveAttribute('href', 'https://www.caf.fr/partenaires/bareme');
      expect(result).not.toHaveTextContent(/Plancher appliqué|Plafond appliqué/);
    });

    it('tells when the floor was applied', async () => {
      api.fetchCrecheEstimate.mockResolvedValue({ ...estimate, floorApplied: true });
      const user = renderPage();
      await fill(user, '5 000');
      await user.click(screen.getByRole('button', { name: 'Estimer le tarif' }));
      expect(await screen.findByText(/Plancher appliqué.*814,62\s€/)).toBeInTheDocument();
    });

    it('tells when the ceiling was applied', async () => {
      api.fetchCrecheEstimate.mockResolvedValue({ ...estimate, ceilingApplied: true });
      const user = renderPage();
      await fill(user, '200 000');
      await user.click(screen.getByRole('button', { name: 'Estimer le tarif' }));
      expect(await screen.findByText(/Plafond appliqué.*8\s?500,00\s€/)).toBeInTheDocument();
    });

    it('validates the inputs before calling the API', async () => {
      const user = renderPage();
      await screen.findByLabelText('Revenus annuels de l’année N-2');
      await user.click(screen.getByRole('button', { name: 'Estimer le tarif' }));
      expect(screen.getByText(/Saisissez vos revenus annuels/)).toBeInTheDocument();
      expect(screen.getByText('Saisissez le nombre d’heures facturées par mois.')).toBeInTheDocument();
      expect(api.fetchCrecheEstimate).not.toHaveBeenCalled();
    });

    it('explains a rejected request', async () => {
      api.fetchCrecheEstimate.mockRejectedValue(new ApiError(400, 'invalid'));
      const user = renderPage();
      await fill(user);
      await user.click(screen.getByRole('button', { name: 'Estimer le tarif' }));
      expect(await screen.findByText(/Ces valeurs ne sont pas acceptées/)).toBeInTheDocument();
      expect(screen.queryByRole('status', { name: 'Résultat de l’estimation' })).not.toBeInTheDocument();
    });
  });
});
