import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../infrastructure/api-client';
import { renderInApp } from '../../test/render-app';
import { account } from '../../test/fixtures';

const api = vi.hoisted(() => ({
  fetchAccounts: vi.fn(),
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
  deleteAccount: vi.fn(),
  createTransaction: vi.fn(),
}));

vi.mock('../../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/api-client')>()),
  apiClient: api,
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'alice', email: 'alice@example.test', name: 'Alice' }, loading: false, logout: vi.fn() }),
}));

import { ComptesPage } from './ComptesPage';

const accounts = [
  account({ id: 'a1', name: 'Compte commun', balanceCents: 98450, projectedMonthEndCents: 41200, transactionCount: 37 }),
  account({ id: 'a2', name: 'Courant de Thomas', balanceCents: 8000, projectedMonthEndCents: -4500, transactionCount: 1 }),
  account({ id: 'a3', name: 'Livret A', kind: 'SAVINGS', balanceCents: 500000, projectedMonthEndCents: 500000, transactionCount: 0 }),
  account({ id: 'a4', name: 'Ancien compte', archived: true, balanceCents: 1200, projectedMonthEndCents: 1200, transactionCount: 12 }),
];

const renderPage = (kind: 'COMMON' | 'PERSONAL' = 'COMMON') => renderInApp(<ComptesPage />, { path: '/comptes', kind });

const card = async (name: string) => (await screen.findByRole('heading', { name })).closest('li') as HTMLElement;

describe('ComptesPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchAccounts.mockResolvedValue(accounts);
    api.createAccount.mockResolvedValue(accounts[0]);
    api.updateAccount.mockResolvedValue(undefined);
    api.deleteAccount.mockResolvedValue(undefined);
  });

  describe('list', () => {
    it('shows current balance, projected balance, type and operation count for each account', async () => {
      renderPage();
      const common = await card('Compte commun');
      expect(common).toHaveTextContent('Compte courant · 37 opérations');
      expect(common).toHaveTextContent(/Solde actuel\s*984,50\s€/);
      expect(common).toHaveTextContent(/Fin du mois \(estimé\)\s*412,00\s€/);
      expect(within(common).queryByRole('alert')).not.toBeInTheDocument();
      const savings = await card('Livret A');
      expect(savings).toHaveTextContent('Livret ou épargne · Aucune opération');
      expect(api.fetchAccounts).toHaveBeenCalledWith('s-common');
    });

    it('flags an account that goes below zero with a clear sentence', async () => {
      renderPage();
      const risky = await card('Courant de Thomas');
      expect(within(risky).getByRole('alert')).toHaveTextContent(/passerait sous zéro avant la fin du mois \(-45,00\s€\)/);
      expect(within(risky).getByText(/-45,00\s€/, { selector: 'dd' })).toHaveClass('text-error');
    });

    it('lists archived accounts apart, without projection', async () => {
      renderPage();
      const section = await screen.findByRole('region', { name: 'Comptes archivés' });
      const archived = within(section).getByRole('heading', { name: 'Ancien compte' }).closest('li') as HTMLElement;
      expect(archived).toHaveTextContent('Archivé');
      expect(archived).not.toHaveTextContent('Fin du mois');
      expect(within(archived).getByRole('button', { name: 'Désarchiver Ancien compte' })).toBeInTheDocument();
    });

    it('works on the personal space', async () => {
      renderPage('PERSONAL');
      await card('Compte commun');
      expect(api.fetchAccounts).toHaveBeenCalledWith('s-alice');
    });

    it('offers a retry when loading fails', async () => {
      api.fetchAccounts.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValue(accounts);
      const user = renderPage();
      expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les comptes');
      await user.click(screen.getByRole('button', { name: 'Réessayer' }));
      expect(await card('Compte commun')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    beforeEach(() => api.fetchAccounts.mockResolvedValue([]));

    it('explains what accounts are for, in plain words', async () => {
      renderPage();
      const section = await screen.findByRole('region', { name: 'À quoi servent les comptes' });
      expect(section).toHaveTextContent(/où l’argent circule/);
      expect(section).toHaveTextContent(/qui décide du budget/);
      expect(section).toHaveTextContent(/facultatif/);
    });

    it('opens the form from the call to action', async () => {
      const user = renderPage();
      await user.click(await screen.findByRole('button', { name: 'Ajouter mon premier compte' }));
      expect(await screen.findByRole('dialog', { name: 'Nouveau compte' })).toBeInTheDocument();
    });
  });

  describe('add and edit', () => {
    it('adds an account with a signed opening balance in cents', async () => {
      const user = renderPage();
      await card('Compte commun');
      await user.click(screen.getByRole('button', { name: 'Ajouter un compte' }));
      const dialog = await screen.findByRole('dialog', { name: 'Nouveau compte' });
      await user.type(within(dialog).getByLabelText('Nom du compte'), 'Espèces maison');
      await user.click(within(dialog).getByRole('button', { name: 'Espèces' }));
      await user.type(within(dialog).getByLabelText('Solde d’ouverture'), '-150,50');
      fireEvent.change(within(dialog).getByLabelText('Date d’ouverture'), { target: { value: '2026-11-01' } });
      await user.click(within(dialog).getByRole('button', { name: 'Ajouter le compte' }));

      await waitFor(() =>
        expect(api.createAccount).toHaveBeenCalledWith('s-common', {
          name: 'Espèces maison',
          kind: 'CASH',
          openingBalanceCents: -15050,
          openingDate: '2026-11-01',
        }),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await waitFor(() => expect(api.fetchAccounts).toHaveBeenCalledTimes(2));
    });

    it('validates the form before calling the API', async () => {
      const user = renderPage();
      await card('Compte commun');
      await user.click(screen.getByRole('button', { name: 'Ajouter un compte' }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText('Solde d’ouverture'), 'beaucoup');
      await user.click(within(dialog).getByRole('button', { name: 'Ajouter le compte' }));
      expect(within(dialog).getByText('Donnez un nom à ce compte (ex. Compte commun).')).toBeInTheDocument();
      expect(within(dialog).getByText(/Montant invalide/)).toBeInTheDocument();
      expect(api.createAccount).not.toHaveBeenCalled();
    });

    it('refuses a name already used, even in another case', async () => {
      const user = renderPage();
      await card('Compte commun');
      await user.click(screen.getByRole('button', { name: 'Ajouter un compte' }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText('Nom du compte'), 'livret a');
      await user.click(within(dialog).getByRole('button', { name: 'Ajouter le compte' }));
      expect(within(dialog).getByText(/déjà ce nom/)).toBeInTheDocument();
      expect(api.createAccount).not.toHaveBeenCalled();
    });

    it('keeps the form open with the server message when the creation fails', async () => {
      api.createAccount.mockRejectedValue(new ApiError(400, 'nom pris'));
      const user = renderPage();
      await card('Compte commun');
      await user.click(screen.getByRole('button', { name: 'Ajouter un compte' }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText('Nom du compte'), 'Nouveau');
      await user.click(within(dialog).getByRole('button', { name: 'Ajouter le compte' }));
      expect(await within(dialog).findByText(/L’enregistrement a échoué/)).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('edits an account, prefilled, and keeps its archive state', async () => {
      const user = renderPage();
      await card('Courant de Thomas');
      await user.click(screen.getByRole('button', { name: 'Modifier Courant de Thomas' }));
      const dialog = await screen.findByRole('dialog', { name: 'Modifier le compte' });
      expect(within(dialog).getByLabelText('Nom du compte')).toHaveValue('Courant de Thomas');
      expect(within(dialog).getByLabelText('Solde d’ouverture')).toHaveValue('1200');
      expect(within(dialog).getByLabelText('Date d’ouverture')).toHaveValue('2026-10-01');
      const name = within(dialog).getByLabelText('Nom du compte');
      await user.clear(name);
      await user.type(name, 'Courant Thomas');
      await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
      await waitFor(() =>
        expect(api.updateAccount).toHaveBeenCalledWith('s-common', 'a2', {
          name: 'Courant Thomas',
          kind: 'CHECKING',
          openingBalanceCents: 120000,
          openingDate: '2026-10-01',
          archived: false,
        }),
      );
    });
  });

  describe('archive and delete', () => {
    it('archives an account with its full payload', async () => {
      const user = renderPage();
      await card('Livret A');
      await user.click(screen.getByRole('button', { name: 'Archiver Livret A' }));
      await waitFor(() =>
        expect(api.updateAccount).toHaveBeenCalledWith('s-common', 'a3', {
          name: 'Livret A',
          kind: 'SAVINGS',
          openingBalanceCents: 120000,
          openingDate: '2026-10-01',
          archived: true,
        }),
      );
    });

    it('unarchives an account', async () => {
      const user = renderPage();
      await user.click(await screen.findByRole('button', { name: 'Désarchiver Ancien compte' }));
      await waitFor(() => expect(api.updateAccount).toHaveBeenCalledWith('s-common', 'a4', expect.objectContaining({ archived: false })));
    });

    it('asks for confirmation before deleting', async () => {
      const user = renderPage();
      await card('Livret A');
      await user.click(screen.getByRole('button', { name: 'Supprimer Livret A' }));
      expect(api.deleteAccount).not.toHaveBeenCalled();
      const item = await card('Livret A');
      await user.click(within(item).getByRole('button', { name: 'Supprimer' }));
      await waitFor(() => expect(api.deleteAccount).toHaveBeenCalledWith('s-common', 'a3'));
      await waitFor(() => expect(api.fetchAccounts).toHaveBeenCalledTimes(2));
    });

    it('explains clearly, and suggests archiving, when the deletion is refused', async () => {
      api.deleteAccount.mockRejectedValue(new ApiError(400, 'Des opérations y sont rattachées'));
      const user = renderPage();
      const item = await card('Compte commun');
      await user.click(within(item).getByRole('button', { name: 'Supprimer Compte commun' }));
      await user.click(within(item).getByRole('button', { name: 'Supprimer' }));
      expect(await within(item).findByText(/archivez-le plutôt/)).toBeInTheDocument();
      expect(within(item).getByRole('button', { name: 'Archiver Compte commun' })).toBeInTheDocument();
    });

    it('reports other deletion failures without blaming the account', async () => {
      api.deleteAccount.mockRejectedValue(new ApiError(500, 'boom'));
      const user = renderPage();
      const item = await card('Livret A');
      await user.click(within(item).getByRole('button', { name: 'Supprimer Livret A' }));
      await user.click(within(item).getByRole('button', { name: 'Supprimer' }));
      expect(await within(item).findByText(/Suppression impossible pour le moment/)).toBeInTheDocument();
      expect(within(item).queryByText(/archivez-le/)).not.toBeInTheDocument();
    });
  });
});
