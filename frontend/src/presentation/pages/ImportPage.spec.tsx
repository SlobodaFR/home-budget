import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HouseholdContext, HouseholdContextValue } from '../../application/use-household';
import { AccountsProvider } from '../../application/use-accounts';
import { OfflineQueueProvider } from '../../application/use-offline-queue';
import { SelectedMonthProvider, useSelectedMonth } from '../../application/use-selected-month';
import { SpaceProvider } from '../../application/use-space';
import { Household } from '../../domain/household';
import { ImportPreview } from '../../domain/statement-import';
import { ApiError, NetworkError } from '../../infrastructure/api-client';
import { ToastProvider } from '../components/Toast';
import { account, previewRow } from '../../test/fixtures';

const api = vi.hoisted(() => ({
  previewImport: vi.fn(),
  commitImport: vi.fn(),
  fetchRules: vi.fn(),
  saveRules: vi.fn(),
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

import { ImportPage } from './ImportPage';

const household: Household = {
  id: 'h1',
  name: 'Famille',
  role: 'OWNER',
  contributionMode: 'EQUAL',
  members: [{ userId: 'alice', name: 'Alice', role: 'OWNER', netMonthlyIncomeCents: null }],
  spaces: [
    { id: 's-common', kind: 'COMMON', name: 'Commun' },
    { id: 's-alice', kind: 'PERSONAL', name: 'Perso' },
  ],
};

const preview: ImportPreview = {
  rows: [
    previewRow(0, { label: 'PRLV LOYER', amountCents: -110000, target: 'FIXE', date: '2026-10-02T00:00:00.000Z' }),
    previewRow(1, { label: 'VIR SALAIRE', amountCents: 250000, target: 'INCOME', date: '2026-10-28T00:00:00.000Z' }),
    previewRow(2, { label: 'CB BOULANGERIE PAUL', amountCents: -450, date: '2026-09-30T00:00:00.000Z' }),
    previewRow(3, { label: 'CB CINEMA PATHE', amountCents: -1500, date: '2026-10-12T00:00:00.000Z' }),
    previewRow(4, { label: 'PRLV EDF', amountCents: -7000, target: 'FIXE', duplicate: true, date: '2026-10-05T00:00:00.000Z' }),
  ],
  skipped: [],
  truncated: false,
};

const STATEMENT = 'date;libellé;montant\n02/10/2026;PRLV LOYER;-1100,00';

function MonthProbe() {
  return <p data-testid="home">Accueil {useSelectedMonth().month}</p>;
}

function renderPage() {
  const value: HouseholdContextValue = {
    household,
    loading: false,
    offline: false,
    failed: false,
    reload: vi.fn(),
    setHousehold: vi.fn(),
  };
  render(
    <MemoryRouter initialEntries={['/import']}>
      <HouseholdContext.Provider value={value}>
        <SpaceProvider>
          <OfflineQueueProvider>
            <AccountsProvider>
              <SelectedMonthProvider initialMonth="2026-06">
                <ToastProvider>
                  <Routes>
                    <Route path="/import" element={<ImportPage />} />
                    <Route path="/" element={<MonthProbe />} />
                  </Routes>
                </ToastProvider>
              </SelectedMonthProvider>
            </AccountsProvider>
          </OfflineQueueProvider>
        </SpaceProvider>
      </HouseholdContext.Provider>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

async function pasteAndAnalyze(user: ReturnType<typeof userEvent.setup>, text = STATEMENT) {
  await user.click(screen.getByLabelText(/collez le contenu/i));
  await user.paste(text);
  await user.click(screen.getByRole('button', { name: 'Analyser' }));
  await screen.findByText(/Étape 2 sur 2/);
}

const radio = (rowLabel: string, name: string) =>
  within(screen.getByRole('radiogroup', { name: `Classement de ${rowLabel}` })).getByRole('radio', { name });

describe('ImportPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.previewImport.mockResolvedValue(preview);
    api.commitImport.mockResolvedValue({ created: 4 });
    api.fetchRules.mockResolvedValue({ rules: [{ keyword: 'loyer', target: 'FIXE' }], isDefault: true });
    api.saveRules.mockResolvedValue(undefined);
    api.fetchAccounts.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('goes from the pasted statement to the home page on the dominant month', async () => {
    const user = renderPage();
    expect(screen.getByText(/Étape 1 sur 2/)).toBeInTheDocument();
    expect(screen.getByText(/lu sur cet appareil/)).toBeInTheDocument();

    await pasteAndAnalyze(user);
    expect(api.previewImport).toHaveBeenCalledWith('s-common', STATEMENT, null);

    await user.click(radio('CB BOULANGERIE PAUL', 'Courant'));
    await user.click(radio('CB CINEMA PATHE', 'Plaisir'));
    const cinema = screen.getByRole('radiogroup', { name: 'Classement de CB CINEMA PATHE' }).closest('li') as HTMLElement;
    await user.click(within(cinema).getByRole('checkbox', { name: 'Retenir pour la prochaine fois' }));
    await user.click(screen.getByRole('button', { name: 'Importer 4 opérations' }));

    await waitFor(() => expect(screen.getByTestId('home')).toHaveTextContent('Accueil 2026-10'));
    expect(api.saveRules).toHaveBeenCalledWith('s-common', [
      { keyword: 'loyer', target: 'FIXE' },
      { keyword: 'cinema', target: 'PLAISIR' },
    ]);
    expect(api.saveRules.mock.invocationCallOrder[0]).toBeLessThan(api.commitImport.mock.invocationCallOrder[0]);
    expect(api.commitImport).toHaveBeenCalledWith('s-common', [
      { kind: 'EXPENSE', bloc: 'FIXE', label: 'PRLV LOYER', amountCents: 110000, date: '2026-10-02T00:00:00.000Z' },
      { kind: 'INCOME', label: 'VIR SALAIRE', amountCents: 250000, date: '2026-10-28T00:00:00.000Z' },
      { kind: 'EXPENSE', bloc: 'COURANT', label: 'CB BOULANGERIE PAUL', amountCents: 450, date: '2026-09-30T00:00:00.000Z' },
      { kind: 'EXPENSE', bloc: 'PLAISIR', label: 'CB CINEMA PATHE', amountCents: 1500, date: '2026-10-12T00:00:00.000Z' },
    ], null);
    expect(screen.getByText('4 opérations importées')).toBeInTheDocument();
  });

  it('does not touch the rules when nothing is remembered', async () => {
    const user = renderPage();
    await pasteAndAnalyze(user);
    await user.click(radio('CB BOULANGERIE PAUL', 'Courant'));
    await user.click(radio('CB CINEMA PATHE', 'Ignorer'));
    await user.click(screen.getByRole('button', { name: 'Importer 3 opérations' }));
    await waitFor(() => expect(api.commitImport).toHaveBeenCalled());
    expect(api.fetchRules).not.toHaveBeenCalled();
    expect(api.saveRules).not.toHaveBeenCalled();
  });

  it('keeps the review and the choices when the commit fails, then allows a retry', async () => {
    api.commitImport.mockRejectedValueOnce(new ApiError(400, 'items.1.amountCents invalide')).mockResolvedValueOnce({ created: 3 });
    const user = renderPage();
    await pasteAndAnalyze(user);
    await user.click(radio('CB BOULANGERIE PAUL', 'Courant'));
    await user.click(radio('CB CINEMA PATHE', 'Ignorer'));
    await user.click(screen.getByRole('button', { name: 'Importer 3 opérations' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/rien n’a été créé.*items\.1\.amountCents invalide/);
    expect(screen.getByText(/Étape 2 sur 2/)).toBeInTheDocument();
    expect(radio('CB BOULANGERIE PAUL', 'Courant')).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Importer 3 opérations' }));
    await waitFor(() => expect(screen.getByTestId('home')).toBeInTheDocument());
    expect(api.commitImport).toHaveBeenCalledTimes(2);
  });

  it('stops before the commit when the rules cannot be saved', async () => {
    api.saveRules.mockRejectedValue(new ApiError(500, 'boom'));
    const user = renderPage();
    await pasteAndAnalyze(user);
    await user.click(radio('CB BOULANGERIE PAUL', 'Courant'));
    await user.click(radio('CB CINEMA PATHE', 'Plaisir'));
    const cinema = screen.getByRole('radiogroup', { name: 'Classement de CB CINEMA PATHE' }).closest('li') as HTMLElement;
    await user.click(within(cinema).getByRole('checkbox', { name: 'Retenir pour la prochaine fois' }));
    await user.click(screen.getByRole('button', { name: 'Importer 4 opérations' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/règles.*rien n’a été importé/);
    expect(api.commitImport).not.toHaveBeenCalled();
  });

  it('shows a network error from the preview and stays on the first step', async () => {
    api.previewImport.mockRejectedValue(new NetworkError());
    const user = renderPage();
    await user.click(screen.getByLabelText(/collez le contenu/i));
    await user.paste(STATEMENT);
    await user.click(screen.getByRole('button', { name: 'Analyser' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Pas de connexion');
    expect(screen.getByText(/Étape 1 sur 2/)).toBeInTheDocument();
    expect(screen.getByLabelText(/collez le contenu/i)).toHaveValue(STATEMENT);
  });

  it('disables the analysis with an explanation when offline', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const user = renderPage();
    await user.click(screen.getByLabelText(/collez le contenu/i));
    await user.paste(STATEMENT);
    expect(screen.getByRole('button', { name: 'Analyser' })).toBeDisabled();
    expect(screen.getByText(/Hors ligne : l’analyse demande une connexion/)).toBeInTheDocument();
  });

  it('needs some text before analysing', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Analyser' })).toBeDisabled();
  });

  it('decodes a windows-1252 file and sends the accents intact', async () => {
    const bytes = new Uint8Array([...Array.from('date;libell', (c) => c.charCodeAt(0)), 0xe9, ...Array.from(';montant\n02/10/2026;CAF', (c) => c.charCodeAt(0)), 0xc9, ...Array.from(';-4,50', (c) => c.charCodeAt(0))]);
    const file = new File([bytes], 'releve.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'arrayBuffer', { value: () => Promise.resolve(bytes.buffer) });
    const user = renderPage();
    await user.upload(screen.getByLabelText('Fichier du relevé'), file);

    expect(await screen.findByText(/releve\.csv lu \(Windows-1252\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/collez le contenu/i)).toHaveValue('date;libellé;montant\n02/10/2026;CAFÉ;-4,50');
    await user.click(screen.getByRole('button', { name: 'Analyser' }));
    await screen.findByText(/Étape 2 sur 2/);
    expect(api.previewImport).toHaveBeenCalledWith('s-common', 'date;libellé;montant\n02/10/2026;CAFÉ;-4,50', null);
  });

  it('refuses a file larger than 1 Mo without reading it', async () => {
    const file = new File([new Uint8Array(1_000_001)], 'gros.csv', { type: 'text/csv' });
    const arrayBuffer = vi.fn();
    Object.defineProperty(file, 'arrayBuffer', { value: arrayBuffer });
    const user = renderPage();
    await user.upload(screen.getByLabelText('Fichier du relevé'), file);
    expect(await screen.findByRole('alert')).toHaveTextContent(/dépasse 1 Mo/);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Analyser' })).toBeDisabled();
  });

  it('goes back to the first step and keeps the text', async () => {
    const user = renderPage();
    await pasteAndAnalyze(user);
    await user.click(screen.getByRole('button', { name: 'Changer de relevé' }));
    expect(screen.getByLabelText(/collez le contenu/i)).toHaveValue(STATEMENT);
  });

  describe('rules section', () => {
    async function openRules(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole('button', { name: /Mes règles de classement/ }));
      await screen.findByText(/règles de départ/);
    }

    it('lists the rules lazily and tells when they are the default ones', async () => {
      api.fetchRules.mockResolvedValue({
        rules: [
          { keyword: 'loyer', target: 'FIXE' },
          { keyword: 'cinema', target: 'PLAISIR' },
        ],
        isDefault: true,
      });
      const user = renderPage();
      expect(api.fetchRules).not.toHaveBeenCalled();
      await openRules(user);
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });

    it('edits, reorders and saves the full list', async () => {
      api.fetchRules.mockResolvedValue({
        rules: [
          { keyword: 'loyer', target: 'FIXE' },
          { keyword: 'cinema', target: 'PLAISIR' },
          { keyword: 'netflix', target: 'FIXE' },
        ],
        isDefault: false,
      });
      const user = renderPage();
      await user.click(screen.getByRole('button', { name: /Mes règles de classement/ }));
      await screen.findByText(/propres à cet espace/);
      const save = screen.getByRole('button', { name: 'Enregistrer les règles' });
      expect(save).toBeDisabled();

      await user.click(screen.getByRole('button', { name: 'Supprimer la règle loyer' }));
      await user.click(screen.getByRole('button', { name: 'Descendre la règle cinema' }));
      await user.type(screen.getByLabelText('Nouvelle règle : mot-clé'), 'boulangerie');
      await user.selectOptions(screen.getByLabelText('Classer dans'), 'COURANT');
      await user.click(screen.getByRole('button', { name: 'Ajouter la règle' }));
      await user.click(save);

      await waitFor(() =>
        expect(api.saveRules).toHaveBeenCalledWith('s-common', [
          { keyword: 'netflix', target: 'FIXE' },
          { keyword: 'cinema', target: 'PLAISIR' },
          { keyword: 'boulangerie', target: 'COURANT' },
        ]),
      );
      await waitFor(() => expect(api.fetchRules).toHaveBeenCalledTimes(2));
    });

    it('refuses a keyword that is too short or already used', async () => {
      const user = renderPage();
      await openRules(user);
      await user.type(screen.getByLabelText('Nouvelle règle : mot-clé'), 'x');
      await user.click(screen.getByRole('button', { name: 'Ajouter la règle' }));
      expect(screen.getByRole('alert')).toHaveTextContent(/entre 2 et 40/);
      await user.clear(screen.getByLabelText('Nouvelle règle : mot-clé'));
      await user.type(screen.getByLabelText('Nouvelle règle : mot-clé'), 'LOYER');
      await user.click(screen.getByRole('button', { name: 'Ajouter la règle' }));
      expect(screen.getByRole('alert')).toHaveTextContent(/existe déjà/);
    });

    it('shows a readable error when the rules cannot be loaded', async () => {
      api.fetchRules.mockRejectedValue(new ApiError(500, 'boom'));
      const user = renderPage();
      await user.click(screen.getByRole('button', { name: /Mes règles de classement/ }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les règles.');
    });
  });

  describe('bank account', () => {
    const accounts = [account({ id: 'a1', name: 'Compte commun' }), account({ id: 'a2', name: 'Livret A' }), account({ id: 'a3', name: 'Ancien', archived: true })];
    const pickAccount = async (user: ReturnType<typeof renderPage>, id: string) => {
      const select = await screen.findByLabelText('Compte du relevé (facultatif)');
      await waitFor(() => expect(within(select).getAllByRole('option').length).toBeGreaterThan(1));
      await user.selectOptions(select, id);
    };

    beforeEach(() => api.fetchAccounts.mockResolvedValue(accounts));

    it('shows no selector when the space has no account', async () => {
      api.fetchAccounts.mockResolvedValue([]);
      renderPage();
      await screen.findByText(/Étape 1 sur 2/);
      expect(screen.queryByLabelText('Compte du relevé (facultatif)')).not.toBeInTheDocument();
    });

    it('lists only non archived accounts, with « Aucun » by default', async () => {
      renderPage();
      const select = (await screen.findByLabelText('Compte du relevé (facultatif)')) as HTMLSelectElement;
      await waitFor(() => expect(select.options.length).toBe(3));
      expect(Array.from(select.options).map((option) => option.textContent)).toEqual(['Aucun', 'Compte commun', 'Livret A']);
      expect(select).toHaveValue('');
    });

    it('sends the chosen account to the preview and to the commit, then remembers it', async () => {
      const user = renderPage();
      await pickAccount(user, 'a2');
      await pasteAndAnalyze(user);
      expect(api.previewImport).toHaveBeenCalledWith('s-common', STATEMENT, 'a2');
      expect(screen.getByText(/rattachées au compte/)).toHaveTextContent('Livret A');
      await user.click(radio('CB BOULANGERIE PAUL', 'Courant'));
      await user.click(radio('CB CINEMA PATHE', 'Ignorer'));
      await user.click(screen.getByRole('button', { name: 'Importer 3 opérations' }));
      await waitFor(() => expect(api.commitImport).toHaveBeenCalledWith('s-common', expect.any(Array), 'a2'));
      expect(window.localStorage.getItem('foyer-budget:last-account:s-common')).toBe('a2');
    });

    it('preselects the last account chosen in the space', async () => {
      window.localStorage.setItem('foyer-budget:last-account:s-common', 'a1');
      renderPage();
      const select = await screen.findByLabelText('Compte du relevé (facultatif)');
      await waitFor(() => expect(select).toHaveValue('a1'));
    });

    it('ignores a remembered account that is now archived', async () => {
      window.localStorage.setItem('foyer-budget:last-account:s-common', 'a3');
      const user = renderPage();
      const select = await screen.findByLabelText('Compte du relevé (facultatif)');
      await waitFor(() => expect(within(select).getAllByRole('option').length).toBe(3));
      expect(select).toHaveValue('');
      await pasteAndAnalyze(user);
      expect(api.previewImport).toHaveBeenCalledWith('s-common', STATEMENT, null);
    });
  });
});
