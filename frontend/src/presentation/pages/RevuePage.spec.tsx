import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '../../infrastructure/api-client';
import { review, reviewHistoryItem, reviewSnapshot } from '../../test/fixtures';
import { renderInApp } from '../../test/render-app';

const api = vi.hoisted(() => ({
  fetchReview: vi.fn(),
  fetchReviews: vi.fn(),
  saveReview: vi.fn(),
  fetchAccounts: vi.fn(),
}));

vi.mock('../../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/api-client')>()),
  apiClient: api,
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'alice', email: 'alice@example.test', name: 'Alice' }, loading: false, logout: vi.fn() }),
}));

import { RevuePage } from './RevuePage';

const plain = (value: string | null | undefined) => (value ?? '').replace(/[\s  ]/g, ' ');

const renderPage = (kind: 'COMMON' | 'PERSONAL' = 'COMMON') => renderInApp(<RevuePage />, { path: '/revue', kind });

/** Seule la date est simulée : les minuteries restent réelles pour `waitFor` et `user-event`. */
const today = (year: number, monthIndex: number, day: number) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(year, monthIndex, day, 12, 0, 0));
};

const drafted = review({
  month: '2026-11',
  status: 'DRAFT',
  answers: { wentWell: 'On a cuisiné', surprise: 'Les courses', decision: '' },
});

describe('RevuePage', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    today(2026, 10, 15);
    api.fetchReview.mockImplementation(async (_space: string, month: string) => review({ month }));
    api.fetchReviews.mockResolvedValue([]);
    api.saveReview.mockResolvedValue(undefined);
    api.fetchAccounts.mockResolvedValue([]);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('month choice', () => {
    it('opens the current month after the 7th and loads the history of the space', async () => {
      renderPage();
      expect(await screen.findByRole('heading', { name: 'novembre 2026' })).toBeInTheDocument();
      expect(api.fetchReview).toHaveBeenCalledWith('s-common', '2026-11');
      expect(api.fetchReviews).toHaveBeenCalledWith('s-common');
      expect(screen.getByRole('heading', { name: 'Ma revue du mois' })).toBeInTheDocument();
    });

    it('opens the previous month during the first seven days when it is not done', async () => {
      today(2026, 10, 3);
      api.fetchReviews.mockResolvedValue([reviewHistoryItem({ month: '2026-10', status: 'DRAFT', completedAt: null })]);
      renderPage();
      expect(await screen.findByRole('heading', { name: 'octobre 2026' })).toBeInTheDocument();
      expect(api.fetchReview).toHaveBeenCalledWith('s-common', '2026-10');
      expect(api.fetchReview).not.toHaveBeenCalledWith('s-common', '2026-11');
    });

    it('opens the current month during the first days when the previous one is already done', async () => {
      today(2026, 10, 3);
      api.fetchReviews.mockResolvedValue([reviewHistoryItem({ month: '2026-10', status: 'DONE' })]);
      renderPage();
      expect(await screen.findByRole('heading', { name: 'novembre 2026' })).toBeInTheDocument();
      expect(api.fetchReview).toHaveBeenCalledTimes(1);
      expect(api.fetchReview).toHaveBeenCalledWith('s-common', '2026-11');
    });

    it('falls back to the previous month when the history cannot be read', async () => {
      today(2026, 10, 2);
      api.fetchReviews.mockRejectedValue(new ApiError(500, 'boom'));
      renderPage();
      expect(await screen.findByRole('heading', { name: 'octobre 2026' })).toBeInTheDocument();
      expect(await screen.findByText('Impossible de charger l’historique des revues.')).toBeInTheDocument();
    });

    it('does not jump to another month once the review is saved', async () => {
      today(2026, 10, 3);
      const user = renderPage();
      await screen.findByRole('heading', { name: 'octobre 2026' });
      api.fetchReviews.mockResolvedValue([reviewHistoryItem({ month: '2026-10', status: 'DONE' })]);
      await user.type(await screen.findByLabelText(/Quelle décision/), 'Une liste');
      await user.click(screen.getByRole('button', { name: 'Terminer la revue' }));
      await waitFor(() => expect(api.saveReview).toHaveBeenCalled());
      await waitFor(() => expect(api.fetchReviews).toHaveBeenCalledTimes(2));
      expect(screen.getByRole('heading', { name: 'octobre 2026' })).toBeInTheDocument();
      expect(api.fetchReview).not.toHaveBeenCalledWith('s-common', '2026-11');
    });

    it('never goes to a future month', async () => {
      const user = renderPage();
      await screen.findByRole('heading', { name: 'novembre 2026' });
      expect(screen.getByRole('button', { name: 'Mois suivant' })).toBeDisabled();
      await user.click(screen.getByRole('button', { name: 'Mois précédent' }));
      expect(await screen.findByRole('heading', { name: 'octobre 2026' })).toBeInTheDocument();
      expect(api.fetchReview).toHaveBeenLastCalledWith('s-common', '2026-10');
      expect(screen.getByRole('button', { name: 'Mois suivant' })).toBeEnabled();
      await user.click(screen.getByRole('button', { name: 'Mois suivant' }));
      expect(await screen.findByRole('heading', { name: 'novembre 2026' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Mois suivant' })).toBeDisabled();
    });

    it('titles the personal space as private and loads its review', async () => {
      renderPage('PERSONAL');
      expect(await screen.findByText('Cette revue est privée : vous seul la voyez.')).toBeInTheDocument();
      await waitFor(() => expect(api.fetchReview).toHaveBeenCalledWith('s-alice', '2026-11'));
    });

    it('warns that the current month is not over', async () => {
      renderPage();
      expect(await screen.findByText(/Ce mois n’est pas terminé/)).toBeInTheDocument();
    });

    it('does not warn for a past month', async () => {
      const user = renderPage();
      await screen.findByText(/Ce mois n’est pas terminé/);
      await user.click(screen.getByRole('button', { name: 'Mois précédent' }));
      await screen.findByRole('heading', { name: 'octobre 2026' });
      await waitFor(() => expect(screen.queryByText(/Ce mois n’est pas terminé/)).not.toBeInTheDocument());
    });
  });

  describe('step 1: where do you stand', () => {
    it('reads the balance, income, expenses and savings rate in words', async () => {
      renderPage();
      const snapshot = await screen.findByRole('region', { name: 'Bilan du mois' });
      const text = plain(snapshot.textContent);
      expect(text).toContain('Solde du mois');
      expect(text).toContain('290 €');
      expect(text).toContain('Il vous est resté 290 € après toutes les dépenses.');
      expect(text).toContain('Revenus');
      expect(text).toContain('3 800 €');
      expect(text).toContain('Dépenses');
      expect(text).toContain('3 510 €');
      expect(text).toContain('Taux d’épargne');
      expect(text).toContain('8 %');
    });

    it('shows the four blocs with planned, actual, gap and a written verdict', async () => {
      renderPage();
      const list = await screen.findByRole('list', { name: 'Prévu, réel et écart par bloc' });
      const rows = within(list).getAllByTestId('review-bloc');
      expect(rows.map((row) => row.getAttribute('data-bloc'))).toEqual(['FIXE', 'COURANT', 'PLAISIR', 'EPARGNE']);
      const fixe = plain(rows[0].textContent);
      expect(fixe).toContain('Prévu');
      expect(fixe).toContain('1 750 €');
      expect(fixe).toContain('Réel');
      expect(fixe).toContain('1 710 €');
      expect(fixe).toContain('Sous le prévu');
      expect(fixe).toContain('40 € de moins que prévu.');
      expect(plain(rows[1].textContent)).toContain('Dépassement de 400 € par rapport au prévu.');
      expect(rows[2]).toHaveTextContent('Pile dans le prévu');
      expect(plain(rows[3].textContent)).toContain('Il manque 200 € par rapport à l’épargne prévue.');
      expect(rows[3]).toHaveTextContent('En dessous du prévu');
    });

    it('lists the biggest expenses with their number of operations', async () => {
      renderPage();
      const list = await screen.findByRole('list', { name: 'Plus grosses dépenses' });
      const items = within(list).getAllByTestId('review-top-expense');
      expect(items).toHaveLength(3);
      expect(items[0]).toHaveTextContent('Courses');
      expect(items[0]).toHaveTextContent('9 opérations');
      expect(plain(items[0].textContent)).toContain('1 423 €');
      expect(items[1]).toHaveTextContent('1 opération');
      expect(items[1]).not.toHaveTextContent('1 opérations');
    });

    it('flags missing recurring payments with a link to the import', async () => {
      api.fetchReview.mockImplementation(async (_space: string, month: string) =>
        review({ month, snapshot: reviewSnapshot({ missingRecurring: [{ label: 'Assurance', amountCents: 5000 }, { label: 'Loyer', amountCents: 80000 }] }) }),
      );
      renderPage();
      const note = await screen.findByRole('note', { name: 'Paiements récurrents introuvables' });
      expect(note).toHaveTextContent('2 paiements récurrents introuvables');
      expect(plain(note.textContent)).toContain('Assurance (50 €)');
      expect(plain(note.textContent)).toContain('Loyer (800 €)');
      expect(within(note).getByRole('link', { name: 'Importer un relevé' })).toHaveAttribute('href', '/import');
    });

    it('flags operations without an account with a link to the accounts', async () => {
      api.fetchReview.mockImplementation(async (_space: string, month: string) => review({ month, snapshot: reviewSnapshot({ unassignedTransactionCount: 4 }) }));
      renderPage();
      const note = await screen.findByRole('note', { name: 'Opérations sans compte' });
      expect(note).toHaveTextContent('4 opérations ne sont rattachées à aucun compte.');
      expect(within(note).getByRole('link', { name: 'Voir mes comptes' })).toHaveAttribute('href', '/comptes');
    });

    it('shows neither note when there is nothing to report', async () => {
      renderPage();
      await screen.findByRole('region', { name: 'Bilan du mois' });
      expect(screen.queryByRole('note', { name: 'Paiements récurrents introuvables' })).not.toBeInTheDocument();
      expect(screen.queryByRole('note', { name: 'Opérations sans compte' })).not.toBeInTheDocument();
    });

    it('explains an empty month and points to the import', async () => {
      api.fetchReview.mockImplementation(async (_space: string, month: string) =>
        review({ month, snapshot: reviewSnapshot({ incomeCents: 0, expenseCents: 0, balanceCents: 0, savingsRatePercent: 0, topExpenses: [], blocs: [] }) }),
      );
      renderPage();
      expect(await screen.findByText(/Aucune opération n’a été enregistrée ce mois-ci/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Importer un relevé' })).toHaveAttribute('href', '/import');
      expect(screen.queryByTestId('review-bloc')).not.toBeInTheDocument();
    });
  });

  describe('step 2: three questions', () => {
    it('asks the three questions with a 500 character counter each', async () => {
      const user = renderPage();
      const well = await screen.findByLabelText('Qu’est-ce qui a bien marché ?');
      expect(screen.getByLabelText('Qu’est-ce qui m’a surpris ?')).toBeInTheDocument();
      expect(screen.getByLabelText(/Quelle décision pour le mois prochain ?/)).toBeInTheDocument();
      expect(screen.getAllByText('0 / 500')).toHaveLength(3);
      expect(well).toHaveAttribute('maxlength', '500');
      await user.type(well, 'Bravo');
      expect(screen.getByText('5 / 500')).toBeInTheDocument();
    });

    it('prefills a saved draft and says so', async () => {
      api.fetchReview.mockResolvedValue(drafted);
      renderPage();
      expect(await screen.findByLabelText('Qu’est-ce qui a bien marché ?')).toHaveValue('On a cuisiné');
      expect(screen.getByLabelText('Qu’est-ce qui m’a surpris ?')).toHaveValue('Les courses');
      expect(screen.getByText(/Brouillon enregistré : vous pouvez le reprendre/)).toBeInTheDocument();
    });

    it('saves a draft without a decision, then refreshes the review and the history', async () => {
      const user = renderPage();
      await user.type(await screen.findByLabelText('Qu’est-ce qui a bien marché ?'), 'On a cuisiné');
      expect(screen.getByTestId('review-save-state')).toHaveTextContent('Modifications pas encore enregistrées.');
      await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
      await waitFor(() =>
        expect(api.saveReview).toHaveBeenCalledWith('s-common', '2026-11', { answers: { wentWell: 'On a cuisiné', surprise: '', decision: '' }, complete: false }),
      );
      await waitFor(() => expect(api.fetchReview).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(api.fetchReviews).toHaveBeenCalledTimes(2));
      expect(await screen.findByText('Brouillon enregistré')).toBeInTheDocument();
      expect(screen.getByTestId('review-save-state')).toHaveTextContent('Tout est enregistré.');
    });

    it('refuses to finish without a decision, with a clear message and no request', async () => {
      const user = renderPage();
      await user.type(await screen.findByLabelText('Qu’est-ce qui a bien marché ?'), 'Bien');
      await user.click(screen.getByRole('button', { name: 'Terminer la revue' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Pour terminer la revue, indiquez la décision que vous prenez pour le mois prochain');
      expect(screen.getByLabelText(/Quelle décision/)).toHaveFocus();
      expect(screen.getByLabelText(/Quelle décision/)).toHaveAttribute('aria-invalid', 'true');
      expect(api.saveReview).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Qu’est-ce qui a bien marché ?')).toHaveValue('Bien');
    });

    it('finishes the review, then shows the completion banner and the recap', async () => {
      const user = renderPage();
      await user.type(await screen.findByLabelText(/Quelle décision/), 'Fixer 400 € pour les courses');
      api.fetchReview.mockResolvedValue(
        review({ month: '2026-11', status: 'DONE', completedAt: '2026-11-15T10:30:00.000Z', answers: { wentWell: '', surprise: '', decision: 'Fixer 400 € pour les courses' } }),
      );
      await user.click(screen.getByRole('button', { name: 'Terminer la revue' }));
      await waitFor(() =>
        expect(api.saveReview).toHaveBeenCalledWith('s-common', '2026-11', { answers: { wentWell: '', surprise: '', decision: 'Fixer 400 € pour les courses' }, complete: true }),
      );
      expect(await screen.findByText('Revue terminée le 15 novembre 2026')).toBeInTheDocument();
      expect(screen.getByText('Fixer 400 € pour les courses')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Terminer la revue' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Modifier ma revue' })).toBeInTheDocument();
      expect(await screen.findByText('Revue terminée, bravo !')).toBeInTheDocument();
    });

    it('lets a finished review be modified and saved again', async () => {
      api.fetchReview.mockResolvedValue(
        review({ month: '2026-11', status: 'DONE', completedAt: '2026-11-05T10:30:00.000Z', answers: { wentWell: 'Bien', surprise: '', decision: 'Une liste' } }),
      );
      const user = renderPage();
      expect(await screen.findByText('Revue terminée le 5 novembre 2026')).toBeInTheDocument();
      expect(screen.getByText('Pas de réponse')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Modifier ma revue' }));
      const decision = screen.getByLabelText(/Quelle décision/);
      expect(decision).toHaveValue('Une liste');
      await user.clear(decision);
      await user.type(decision, 'Deux listes');
      await user.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));
      await waitFor(() =>
        expect(api.saveReview).toHaveBeenCalledWith('s-common', '2026-11', { answers: { wentWell: 'Bien', surprise: '', decision: 'Deux listes' }, complete: true }),
      );
      expect(await screen.findByText('Revue modifiée')).toBeInTheDocument();
      expect(await screen.findByRole('button', { name: 'Modifier ma revue' })).toBeInTheDocument();
    });

    it('cancels a modification and restores the saved answers', async () => {
      api.fetchReview.mockResolvedValue(
        review({ month: '2026-11', status: 'DONE', completedAt: '2026-11-05T10:30:00.000Z', answers: { wentWell: '', surprise: '', decision: 'Une liste' } }),
      );
      const user = renderPage();
      await user.click(await screen.findByRole('button', { name: 'Modifier ma revue' }));
      await user.type(screen.getByLabelText(/Quelle décision/), ' et plus');
      await user.click(screen.getByRole('button', { name: 'Annuler' }));
      expect(screen.getByText('Une liste')).toBeInTheDocument();
      expect(api.saveReview).not.toHaveBeenCalled();
    });

    it('requires a decision when modifying a finished review too', async () => {
      api.fetchReview.mockResolvedValue(review({ month: '2026-11', status: 'DONE', completedAt: '2026-11-05T10:30:00.000Z', answers: { wentWell: '', surprise: '', decision: 'Une liste' } }));
      const user = renderPage();
      await user.click(await screen.findByRole('button', { name: 'Modifier ma revue' }));
      await user.clear(screen.getByLabelText(/Quelle décision/));
      await user.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Pour terminer la revue');
      expect(api.saveReview).not.toHaveBeenCalled();
    });
  });

  describe('offline and errors', () => {
    it('keeps the typed text when saving fails offline, explains it, and saves on retry', async () => {
      api.saveReview.mockRejectedValueOnce(new NetworkError());
      const user = renderPage();
      const surprise = await screen.findByLabelText('Qu’est-ce qui m’a surpris ?');
      await user.type(surprise, 'Une facture oubliée');
      await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Pas de connexion : votre texte est conservé sur cet écran.');
      expect(surprise).toHaveValue('Une facture oubliée');
      expect(screen.getByTestId('review-save-state')).toHaveTextContent('Modifications pas encore enregistrées.');
      await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
      await waitFor(() => expect(api.saveReview).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
      expect(surprise).toHaveValue('Une facture oubliée');
    });

    it('keeps the text on a server error as well', async () => {
      api.saveReview.mockRejectedValue(new ApiError(500, 'boom'));
      const user = renderPage();
      const well = await screen.findByLabelText('Qu’est-ce qui a bien marché ?');
      await user.type(well, 'Texte important');
      await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Votre texte est conservé');
      expect(well).toHaveValue('Texte important');
    });

    it('says so when the browser knows it is offline, and still lets you write', async () => {
      vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
      const user = renderPage();
      const well = await screen.findByLabelText('Qu’est-ce qui a bien marché ?');
      expect(screen.getByText(/Vous êtes hors ligne\. Vous pouvez écrire/)).toBeInTheDocument();
      await user.type(well, 'ok');
      expect(well).toHaveValue('ok');
    });

    it('keeps what was typed when you switch month and come back', async () => {
      const user = renderPage();
      await user.type(await screen.findByLabelText('Qu’est-ce qui a bien marché ?'), 'Pas encore enregistré');
      await user.click(screen.getByRole('button', { name: 'Mois précédent' }));
      await screen.findByRole('heading', { name: 'octobre 2026' });
      await waitFor(() => expect(screen.getByLabelText('Qu’est-ce qui a bien marché ?')).toHaveValue(''));
      await user.click(screen.getByRole('button', { name: 'Mois suivant' }));
      await waitFor(() => expect(screen.getByLabelText('Qu’est-ce qui a bien marché ?')).toHaveValue('Pas encore enregistré'));
    });

    it('reports being offline when the review cannot be loaded, and retries', async () => {
      api.fetchReview.mockRejectedValueOnce(new NetworkError());
      const user = renderPage();
      expect(await screen.findByText(/Hors ligne : votre revue reviendra avec le réseau/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Réessayer' }));
      expect(await screen.findByRole('region', { name: 'Bilan du mois' })).toBeInTheDocument();
    });

    it('offers a retry when loading fails for another reason', async () => {
      api.fetchReview.mockRejectedValueOnce(new ApiError(500, 'boom'));
      const user = renderPage();
      expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger la revue de ce mois.');
      await user.click(screen.getByRole('button', { name: 'Réessayer' }));
      expect(await screen.findByRole('region', { name: 'Bilan du mois' })).toBeInTheDocument();
    });
  });

  describe('history', () => {
    const history = [
      reviewHistoryItem({ month: '2026-10', status: 'DRAFT', decision: '', completedAt: null }),
      reviewHistoryItem({ month: '2026-09', status: 'DONE', decision: 'Fixer 400 € pour les courses', completedAt: '2026-10-03T08:00:00.000Z' }),
    ];

    it('lists the months with status in words, decision and completion date', async () => {
      api.fetchReviews.mockResolvedValue(history);
      renderPage();
      const section = await screen.findByRole('region', { name: 'Historique des revues' });
      const items = await within(section).findAllByTestId('review-history-item');
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent('octobre 2026');
      expect(items[0]).toHaveTextContent('Brouillon');
      expect(items[1]).toHaveTextContent('septembre 2026');
      expect(items[1]).toHaveTextContent('Terminée');
      expect(items[1]).toHaveTextContent('Décision : Fixer 400 € pour les courses');
      expect(items[1]).toHaveTextContent('Terminée le 3 octobre 2026');
    });

    it('opens a month on click', async () => {
      api.fetchReviews.mockResolvedValue(history);
      const user = renderPage();
      await user.click(await screen.findByRole('button', { name: 'Ouvrir la revue de septembre 2026' }));
      expect(await screen.findByRole('heading', { name: 'septembre 2026' })).toBeInTheDocument();
      expect(api.fetchReview).toHaveBeenLastCalledWith('s-common', '2026-09');
      expect(screen.getByRole('button', { name: 'Ouvrir la revue de septembre 2026' })).toHaveAttribute('aria-current', 'true');
    });

    it('says what will appear here when there is no review yet', async () => {
      renderPage();
      expect(await screen.findByText(/Vos revues apparaîtront ici/)).toBeInTheDocument();
    });

    it('reports an offline history without blocking the review', async () => {
      api.fetchReviews.mockRejectedValue(new NetworkError());
      renderPage();
      expect(await screen.findByText(/Hors ligne : l’historique de vos revues reviendra avec le réseau/)).toBeInTheDocument();
      expect(await screen.findByRole('region', { name: 'Bilan du mois' })).toBeInTheDocument();
    });
  });

  it('does not send a second request while one is running', async () => {
    let release: () => void = () => undefined;
    api.saveReview.mockReturnValue(new Promise<void>((resolve) => (release = resolve)));
    const user = renderPage();
    fireEvent.change(await screen.findByLabelText('Qu’est-ce qui a bien marché ?'), { target: { value: 'x' } });
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    expect(screen.getByRole('button', { name: 'Terminer la revue' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Enregistrement…' }));
    expect(api.saveReview).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Terminer la revue' })).toBeEnabled());
  });
});
