import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectsSummary } from '../../domain/project';
import { ApiError, NetworkError } from '../../infrastructure/api-client';
import { account, project } from '../../test/fixtures';
import { renderInApp } from '../../test/render-app';

const api = vi.hoisted(() => ({
  fetchProjects: vi.fn(),
  fetchProjectsSummary: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  fetchDeposits: vi.fn(),
  createDeposit: vi.fn(),
  deleteDeposit: vi.fn(),
  fetchAccounts: vi.fn(),
  createTransaction: vi.fn(),
}));

vi.mock('../../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/api-client')>()),
  apiClient: api,
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'alice', email: 'alice@example.test', name: 'Alice' }, loading: false, logout: vi.fn() }),
}));

import { ProjetsPage } from './ProjetsPage';

const plain = (value: string | null | undefined) => (value ?? '').replace(/[\s  ]/g, ' ');

const holiday = project();
const car = project({
  id: 'p2',
  name: 'Voiture',
  kind: 'PURCHASE',
  targetCents: 800000,
  targetDate: '2028-04-30',
  savedCents: 100000,
  remainingCents: 700000,
  progressPercent: 12,
  monthsLeft: 18,
  monthlyNeededCents: 38889,
  status: 'ON_TRACK',
  expectedSavedCents: 90000,
});
const old = project({ id: 'p3', name: 'Ancien vélo', kind: 'GENERIC', archived: true, status: 'DONE', remainingCents: 0, progressPercent: 100, savedCents: 300000 });

const summary: ProjectsSummary = { totalMonthlyNeededCents: 71389, plannedEpargneCents: 50000, gapCents: 21389, activeCount: 2 };

const deposits = [
  { id: 'd2', date: '2026-11-20', amountCents: -5000, note: 'Réparation' },
  { id: 'd1', date: '2026-11-02', amountCents: 20000, note: 'Prime' },
];

const renderPage = (kind: 'COMMON' | 'PERSONAL' = 'COMMON') => renderInApp(<ProjetsPage />, { path: '/projets', kind });

describe('ProjetsPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchAccounts.mockResolvedValue([]);
    api.fetchProjects.mockResolvedValue([holiday, car, old]);
    api.fetchProjectsSummary.mockResolvedValue(summary);
    api.fetchDeposits.mockResolvedValue(deposits);
    api.createProject.mockResolvedValue(holiday);
    api.updateProject.mockResolvedValue(undefined);
    api.deleteProject.mockResolvedValue(undefined);
    api.createDeposit.mockResolvedValue({});
    api.deleteDeposit.mockResolvedValue(undefined);
  });

  describe('list', () => {
    it('loads the projects of the selected space', async () => {
      renderPage();
      await screen.findByRole('list', { name: 'Projets en cours' });
      expect(api.fetchProjects).toHaveBeenCalledWith('s-common');
      expect(api.fetchProjectsSummary).toHaveBeenCalledWith('s-common');
      expect(screen.getByRole('heading', { name: 'Projets communs' })).toBeInTheDocument();
    });

    it('titles the personal space differently and loads its projects', async () => {
      renderPage('PERSONAL');
      expect(await screen.findByRole('heading', { name: 'Projets perso' })).toBeInTheDocument();
      await waitFor(() => expect(api.fetchProjects).toHaveBeenCalledWith('s-alice'));
    });

    it('lists active projects with status in words, progress text, deadline and monthly need', async () => {
      renderPage();
      const list = await screen.findByRole('list', { name: 'Projets en cours' });
      const cards = within(list).getAllByTestId('project-card');
      expect(cards).toHaveLength(2);
      expect(cards[0]).toHaveTextContent('Vacances été 2027');
      expect(within(cards[0]).getByText('En retard')).toBeInTheDocument();
      expect(plain(cards[0].textContent)).toContain('13 % — 400 € sur 3 000 €');
      expect(plain(cards[0].textContent)).toContain('Il faut mettre de côté 325 € par mois.');
      expect(within(cards[1]).getByText('À jour')).toBeInTheDocument();
      expect(within(cards[1]).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '12');
    });

    it('folds the archived projects', async () => {
      const user = renderPage();
      await screen.findByRole('list', { name: 'Projets en cours' });
      const details = screen.getByText('Projets archivés (1)').closest('details') as HTMLDetailsElement;
      expect(details.open).toBe(false);
      await user.click(screen.getByText('Projets archivés (1)'));
      expect(details.open).toBe(true);
      expect(within(details).getByText('Ancien vélo')).toBeInTheDocument();
      expect(within(details).getByText('Archivé')).toBeInTheDocument();
    });

    it('explains an empty space and offers to create the first project', async () => {
      api.fetchProjects.mockResolvedValue([]);
      api.fetchProjectsSummary.mockResolvedValue({ totalMonthlyNeededCents: 0, plannedEpargneCents: 0, gapCents: 0, activeCount: 0 });
      const user = renderPage();
      expect(await screen.findByText('À quoi servent les projets ?')).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Synthèse des projets' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Créer mon premier projet' }));
      expect(await screen.findByRole('dialog', { name: 'Nouveau projet' })).toBeInTheDocument();
    });

    it('offers a retry when loading fails', async () => {
      api.fetchProjects.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValue([holiday]);
      const user = renderPage();
      expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les projets');
      await user.click(screen.getByRole('button', { name: 'Réessayer' }));
      expect(await screen.findByRole('list', { name: 'Projets en cours' })).toBeInTheDocument();
    });

    it('reports being offline', async () => {
      api.fetchProjects.mockRejectedValue(new NetworkError());
      renderPage();
      expect(await screen.findByText(/Hors ligne : vos projets reviendront avec le réseau/)).toBeInTheDocument();
    });
  });

  describe('summary banner', () => {
    it('compares the monthly need with the planned savings and flags the gap in red text with a link to the plan', async () => {
      renderPage();
      const banner = await screen.findByRole('region', { name: 'Synthèse des projets' });
      expect(plain(banner.textContent)).toContain('Besoin par mois');
      expect(plain(banner.textContent)).toContain('713,89 €');
      expect(plain(banner.textContent)).toContain('Épargne prévue');
      expect(plain(banner.textContent)).toContain('500 €');
      const alert = within(banner).getByRole('alert');
      expect(plain(alert.textContent)).toBe('Il manque 213,89 €/mois dans votre plan d’épargne');
      expect(alert.className).toContain('text-error');
      expect(within(banner).getByRole('link', { name: 'Ajuster mon plan' })).toHaveAttribute('href', '/plan');
    });

    it('reassures when the plan covers the projects', async () => {
      api.fetchProjectsSummary.mockResolvedValue({ ...summary, plannedEpargneCents: 80000, gapCents: 0 });
      renderPage();
      const banner = await screen.findByRole('region', { name: 'Synthèse des projets' });
      expect(banner).toHaveTextContent('Votre plan d’épargne couvre vos projets.');
      expect(within(banner).queryByRole('alert')).not.toBeInTheDocument();
      expect(within(banner).queryByRole('link')).not.toBeInTheDocument();
    });

    it('is absent when the summary cannot be read', async () => {
      api.fetchProjectsSummary.mockRejectedValue(new ApiError(500, 'boom'));
      renderPage();
      await screen.findByRole('list', { name: 'Projets en cours' });
      expect(screen.queryByRole('region', { name: 'Synthèse des projets' })).not.toBeInTheDocument();
    });
  });

  describe('creation', () => {
    const openForm = async () => {
      const user = renderPage();
      await screen.findByRole('list', { name: 'Projets en cours' });
      await user.click(screen.getByRole('button', { name: 'Nouveau projet' }));
      return user;
    };

    it('starts with the five templates', async () => {
      await openForm();
      const dialog = await screen.findByRole('dialog', { name: 'Nouveau projet' });
      const items = within(dialog).getAllByRole('listitem');
      expect(items.map((item) => item.querySelector('button span span')?.textContent)).toEqual(['Naissance', 'Vacances', 'Voiture', 'Travaux', 'Autre']);
      expect(within(dialog).queryByLabelText('Somme à atteindre')).not.toBeInTheDocument();
    });

    it('prefills name, type and horizon from a template, without imposing an amount, then creates the project', async () => {
      const user = await openForm();
      const dialog = await screen.findByRole('dialog', { name: 'Nouveau projet' });
      await user.click(within(dialog).getByRole('button', { name: /Naissance/ }));
      expect(within(dialog).getByLabelText('Nom du projet')).toHaveValue('Arrivée du bébé');
      expect(within(dialog).getByRole('button', { name: 'Naissance' })).toHaveAttribute('aria-pressed', 'true');
      expect(within(dialog).getByLabelText('Somme à atteindre')).toHaveValue('');
      const start = (within(dialog).getByLabelText('Date de départ') as HTMLInputElement).value;
      const due = (within(dialog).getByLabelText('Échéance') as HTMLInputElement).value;
      expect(due > start).toBe(true);
      await user.type(within(dialog).getByLabelText('Somme à atteindre'), '2500');
      await user.type(within(dialog).getByLabelText('Déjà épargné au départ'), '300');
      fireEvent.change(within(dialog).getByLabelText('Échéance'), { target: { value: '2027-08-01' } });
      fireEvent.change(within(dialog).getByLabelText('Date de départ'), { target: { value: '2026-11-01' } });
      await user.click(within(dialog).getByRole('button', { name: 'Créer le projet' }));
      await waitFor(() =>
        expect(api.createProject).toHaveBeenCalledWith('s-common', {
          name: 'Arrivée du bébé',
          kind: 'BABY',
          targetCents: 250000,
          targetDate: '2027-08-01',
          startCents: 30000,
          startDate: '2026-11-01',
        }),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await waitFor(() => expect(api.fetchProjects).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(api.fetchProjectsSummary).toHaveBeenCalledTimes(2));
    });

    it('lets you go back to change the template', async () => {
      const user = await openForm();
      const dialog = await screen.findByRole('dialog', { name: 'Nouveau projet' });
      await user.click(within(dialog).getByRole('button', { name: /Vacances/ }));
      await user.click(within(dialog).getByRole('button', { name: 'Changer de modèle' }));
      await user.click(within(dialog).getByRole('button', { name: /Voiture/ }));
      expect(within(dialog).getByLabelText('Nom du projet')).toHaveValue('Voiture');
      expect(within(dialog).getByRole('button', { name: 'Achat' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('validates in French before calling the API', async () => {
      const user = await openForm();
      const dialog = await screen.findByRole('dialog', { name: 'Nouveau projet' });
      await user.click(within(dialog).getByRole('button', { name: /Autre/ }));
      fireEvent.change(within(dialog).getByLabelText('Échéance'), { target: { value: '2020-01-01' } });
      await user.click(within(dialog).getByRole('button', { name: 'Créer le projet' }));
      expect(within(dialog).getByText('Donnez un nom à ce projet (ex. Vacances été 2027).')).toBeInTheDocument();
      expect(within(dialog).getByText('Indiquez la somme à atteindre.')).toBeInTheDocument();
      expect(within(dialog).getByText('L’échéance doit être après la date de départ.')).toBeInTheDocument();
      expect(api.createProject).not.toHaveBeenCalled();
    });

    it('shows a server refusal inside the form and keeps it open', async () => {
      api.createProject.mockRejectedValue(new ApiError(400, 'invalide'));
      const user = await openForm();
      const dialog = await screen.findByRole('dialog', { name: 'Nouveau projet' });
      await user.click(within(dialog).getByRole('button', { name: /Autre/ }));
      await user.type(within(dialog).getByLabelText('Nom du projet'), 'Piscine');
      await user.type(within(dialog).getByLabelText('Somme à atteindre'), '5000');
      await user.click(within(dialog).getByRole('button', { name: 'Créer le projet' }));
      expect(await within(dialog).findByText(/L’enregistrement a échoué/)).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('offers the accounts of the space and sends the chosen one', async () => {
      api.fetchAccounts.mockResolvedValue([account({ id: 'a1', name: 'Compte commun' }), account({ id: 'a2', name: 'Livret A', kind: 'SAVINGS' })]);
      const user = await openForm();
      const dialog = await screen.findByRole('dialog', { name: 'Nouveau projet' });
      await user.click(within(dialog).getByRole('button', { name: /Vacances/ }));
      const select = await within(dialog).findByLabelText('Compte (facultatif)');
      expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual(['Aucun', 'Compte commun', 'Livret A']);
      await user.selectOptions(select, 'a2');
      await user.type(within(dialog).getByLabelText('Somme à atteindre'), '3000');
      await user.click(within(dialog).getByRole('button', { name: 'Créer le projet' }));
      await waitFor(() => expect(api.createProject).toHaveBeenCalledWith('s-common', expect.objectContaining({ accountId: 'a2', kind: 'HOLIDAY' })));
    });

    it('shows no account selector when the space has no account', async () => {
      const user = await openForm();
      const dialog = await screen.findByRole('dialog', { name: 'Nouveau projet' });
      await user.click(within(dialog).getByRole('button', { name: /Vacances/ }));
      expect(within(dialog).queryByLabelText('Compte (facultatif)')).not.toBeInTheDocument();
    });
  });

  describe('edition', () => {
    it('opens a project already filled, without the template step, and saves the changes', async () => {
      const user = renderPage();
      await screen.findByRole('list', { name: 'Projets en cours' });
      await user.click(screen.getByRole('button', { name: 'Modifier Voiture' }));
      const dialog = await screen.findByRole('dialog', { name: 'Modifier le projet' });
      expect(within(dialog).queryByRole('button', { name: 'Changer de modèle' })).not.toBeInTheDocument();
      expect(within(dialog).getByLabelText('Nom du projet')).toHaveValue('Voiture');
      expect(within(dialog).getByLabelText('Somme à atteindre')).toHaveValue('8000');
      expect(within(dialog).getByLabelText('Échéance')).toHaveValue('2028-04-30');
      await user.clear(within(dialog).getByLabelText('Somme à atteindre'));
      await user.type(within(dialog).getByLabelText('Somme à atteindre'), '9500,50');
      await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
      await waitFor(() =>
        expect(api.updateProject).toHaveBeenCalledWith('s-common', 'p2', expect.objectContaining({ name: 'Voiture', kind: 'PURCHASE', targetCents: 950050, archived: false })),
      );
    });

    it('keeps a generic project type selectable so it is not lost', async () => {
      const user = renderPage();
      await screen.findByRole('list', { name: 'Projets en cours' });
      await user.click(screen.getByText('Projets archivés (1)'));
      await user.click(screen.getByRole('button', { name: 'Modifier Ancien vélo' }));
      const dialog = await screen.findByRole('dialog', { name: 'Modifier le projet' });
      expect(within(dialog).getByRole('button', { name: 'Projet' })).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('detail and deposits', () => {
    const openDetail = async (name = 'Vacances été 2027') => {
      const user = renderPage();
      await screen.findByRole('list', { name: 'Projets en cours' });
      await user.click(screen.getByRole('button', { name: `Versements de ${name}` }));
      const dialog = await screen.findByRole('dialog', { name });
      return { user, dialog };
    };

    it('recaps the project and the calculation', async () => {
      const { dialog } = await openDetail();
      expect(within(dialog).getByText('En retard')).toBeInTheDocument();
      expect(plain(dialog.textContent)).toContain('13 % — 400 € sur 3 000 €');
      expect(plain(dialog.textContent)).toContain('Attendu à ce jour : 750 €');
      expect(dialog).toHaveTextContent('objectif − déjà épargné');
      expect(plain(dialog.textContent)).toContain('(3 000 € − 400 €) ÷ 8 mois = 325 € par mois');
      expect(within(dialog).getByTestId('expected-marker')).toBeInTheDocument();
      expect(api.fetchDeposits).toHaveBeenCalledWith('s-common', 'p1');
    });

    it('lists the deposits newest first, with « Retrait » spelled out for a negative one', async () => {
      const { dialog } = await openDetail();
      const items = await within(dialog).findAllByTestId('deposit-item');
      expect(items).toHaveLength(2);
      expect(plain(items[0].textContent)).toMatch(/20 nov\.? 2026/);
      expect(items[0]).toHaveTextContent('Retrait');
      expect(plain(items[0].textContent)).toContain('− 50 €');
      expect(items[0]).toHaveTextContent('Réparation');
      expect(items[1]).not.toHaveTextContent('Retrait');
      expect(plain(items[1].textContent)).toContain('+ 200 €');
    });

    it('says so when there is no deposit yet', async () => {
      api.fetchDeposits.mockResolvedValue([]);
      const { dialog } = await openDetail();
      expect(await within(dialog).findByText(/Aucun versement pour l’instant/)).toBeInTheDocument();
    });

    it('adds a deposit with amount, date and note, then refreshes the project', async () => {
      const { user, dialog } = await openDetail();
      await user.click(within(dialog).getByRole('button', { name: 'Ajouter un versement' }));
      const form = within(dialog).getByRole('form', { name: 'Nouveau versement' });
      await user.type(within(form).getByLabelText('Montant versé'), '150,50');
      fireEvent.change(within(form).getByLabelText('Date'), { target: { value: '2026-12-05' } });
      await user.type(within(form).getByLabelText('Note (facultatif)'), 'Prime');
      await user.click(within(form).getByRole('button', { name: 'Enregistrer le versement' }));
      await waitFor(() => expect(api.createDeposit).toHaveBeenCalledWith('s-common', 'p1', { date: '2026-12-05', amountCents: 15050, note: 'Prime' }));
      await waitFor(() => expect(within(dialog).queryByRole('form', { name: 'Nouveau versement' })).not.toBeInTheDocument());
      await waitFor(() => expect(api.fetchDeposits).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(api.fetchProjects).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(api.fetchProjectsSummary).toHaveBeenCalledTimes(2));
    });

    it('records a withdrawal as a negative amount under the label « Retirer »', async () => {
      const { user, dialog } = await openDetail();
      await user.click(within(dialog).getByRole('button', { name: 'Ajouter un versement' }));
      const form = within(dialog).getByRole('form', { name: 'Nouveau versement' });
      await user.click(within(form).getByRole('button', { name: 'Retirer' }));
      expect(within(form).getByLabelText('Montant à retirer')).toBeInTheDocument();
      await user.type(within(form).getByLabelText('Montant à retirer'), '100');
      await user.click(within(form).getByRole('button', { name: 'Enregistrer le retrait' }));
      await waitFor(() => expect(api.createDeposit).toHaveBeenCalledWith('s-common', 'p1', expect.objectContaining({ amountCents: -10000 })));
    });

    it('refuses a withdrawal larger than the savings and a missing amount before calling the API', async () => {
      const { user, dialog } = await openDetail();
      await user.click(within(dialog).getByRole('button', { name: 'Ajouter un versement' }));
      const form = within(dialog).getByRole('form', { name: 'Nouveau versement' });
      await user.click(within(form).getByRole('button', { name: 'Enregistrer le versement' }));
      expect(within(form).getByText('Saisissez un montant.')).toBeInTheDocument();
      await user.click(within(form).getByRole('button', { name: 'Retirer' }));
      await user.type(within(form).getByLabelText('Montant à retirer'), '400,01');
      await user.click(within(form).getByRole('button', { name: 'Enregistrer le retrait' }));
      expect(within(form).getByText(/plus que ce qui est épargné/)).toBeInTheDocument();
      expect(api.createDeposit).not.toHaveBeenCalled();
    });

    it('shows a server refusal inside the deposit form', async () => {
      api.createDeposit.mockRejectedValue(new ApiError(400, 'non'));
      const { user, dialog } = await openDetail();
      await user.click(within(dialog).getByRole('button', { name: 'Ajouter un versement' }));
      const form = within(dialog).getByRole('form', { name: 'Nouveau versement' });
      await user.type(within(form).getByLabelText('Montant versé'), '10');
      await user.click(within(form).getByRole('button', { name: 'Enregistrer le versement' }));
      expect(await within(form).findByText(/Le versement n’a pas pu être enregistré/)).toBeInTheDocument();
    });

    it('cancels the deposit form', async () => {
      const { user, dialog } = await openDetail();
      await user.click(within(dialog).getByRole('button', { name: 'Ajouter un versement' }));
      await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
      expect(within(dialog).queryByRole('form', { name: 'Nouveau versement' })).not.toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Ajouter un versement' })).toBeInTheDocument();
    });

    it('asks for confirmation before deleting a deposit', async () => {
      const { user, dialog } = await openDetail();
      await within(dialog).findAllByTestId('deposit-item');
      await user.click(within(dialog).getByRole('button', { name: /Supprimer le versement du 2 nov/ }));
      expect(api.deleteDeposit).not.toHaveBeenCalled();
      expect(within(dialog).getByText('Supprimer ce versement ?')).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Non' }));
      expect(api.deleteDeposit).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole('button', { name: /Supprimer le versement du 2 nov/ }));
      await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
      await waitFor(() => expect(api.deleteDeposit).toHaveBeenCalledWith('s-common', 'p1', 'd1'));
      await waitFor(() => expect(api.fetchProjects).toHaveBeenCalledTimes(2));
    });

    it('explains when a deposit cannot be deleted', async () => {
      api.deleteDeposit.mockRejectedValue(new ApiError(400, 'négatif'));
      const { user, dialog } = await openDetail();
      await within(dialog).findAllByTestId('deposit-item');
      await user.click(within(dialog).getByRole('button', { name: /Supprimer le versement du 2 nov/ }));
      await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
      expect(await screen.findByText(/Suppression impossible/)).toBeInTheDocument();
      expect(api.fetchProjects).toHaveBeenCalledTimes(1);
    });

    it('archives the project and closes the sheet', async () => {
      const { user, dialog } = await openDetail();
      await user.click(within(dialog).getByRole('button', { name: 'Archiver' }));
      await waitFor(() =>
        expect(api.updateProject).toHaveBeenCalledWith('s-common', 'p1', {
          name: 'Vacances été 2027',
          kind: 'HOLIDAY',
          targetCents: 300000,
          targetDate: '2027-07-01',
          startCents: 0,
          startDate: '2026-11-01',
          accountId: null,
          archived: true,
        }),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(await screen.findByText(/Projet archivé/)).toBeInTheDocument();
    });

    it('offers « Désarchiver » on an archived project', async () => {
      const user = renderPage();
      await screen.findByRole('list', { name: 'Projets en cours' });
      await user.click(screen.getByText('Projets archivés (1)'));
      await user.click(screen.getByRole('button', { name: 'Versements de Ancien vélo' }));
      const dialog = await screen.findByRole('dialog', { name: 'Ancien vélo' });
      await user.click(within(dialog).getByRole('button', { name: 'Désarchiver' }));
      await waitFor(() => expect(api.updateProject).toHaveBeenCalledWith('s-common', 'p3', expect.objectContaining({ archived: false })));
    });

    it('deletes the project after a confirmation', async () => {
      const { user, dialog } = await openDetail();
      await user.click(within(dialog).getByRole('button', { name: 'Supprimer le projet' }));
      expect(api.deleteProject).not.toHaveBeenCalled();
      expect(within(dialog).getByText('Supprimer ce projet et tous ses versements ?')).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Non' }));
      await user.click(within(dialog).getByRole('button', { name: 'Supprimer le projet' }));
      await user.click(within(dialog).getByRole('button', { name: 'Supprimer le projet' }));
      await waitFor(() => expect(api.deleteProject).toHaveBeenCalledWith('s-common', 'p1'));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('goes from the detail to the edit form', async () => {
      const { user, dialog } = await openDetail();
      await user.click(within(dialog).getByRole('button', { name: 'Modifier' }));
      expect(await screen.findByRole('dialog', { name: 'Modifier le projet' })).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: 'Vacances été 2027' })).not.toBeInTheDocument();
    });

    it('explains a late project without a misleading monthly calculation', async () => {
      api.fetchProjects.mockResolvedValue([project({ status: 'LATE', monthsLeft: 0, monthlyNeededCents: 260000 })]);
      const { dialog } = await openDetail();
      expect(within(dialog).getByText('En retard sur l’échéance')).toBeInTheDocument();
      expect(plain(dialog.textContent)).toContain('Il reste 2 600 € à réunir');
      expect(within(dialog).queryByText('Comment c’est calculé')).not.toBeInTheDocument();
    });

    it('shows a retry when the deposits cannot be loaded', async () => {
      api.fetchDeposits.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValue(deposits);
      const { user, dialog } = await openDetail();
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Impossible de charger les versements');
      await user.click(within(dialog).getByRole('button', { name: 'Réessayer' }));
      expect(await within(dialog).findAllByTestId('deposit-item')).toHaveLength(2);
    });
  });
});
