import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HouseholdContext, HouseholdContextValue } from '../../application/use-household';
import { SpaceProvider } from '../../application/use-space';
import { todayInputValue } from '../../domain/month';
import { ApiError, NetworkError } from '../../infrastructure/api-client';
import { preferences } from '../../infrastructure/local-store';
import { testHousehold } from '../../test/render-app';

const api = vi.hoisted(() => ({
  fetchContribution: vi.fn(),
  fetchSafetyNet: vi.fn(),
  fetchContributionStatus: vi.fn(),
  downloadExport: vi.fn(),
  downloadTransactionsCsv: vi.fn(),
}));
const files = vi.hoisted(() => ({ saveFile: vi.fn() }));

vi.mock('../../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/api-client')>()),
  apiClient: api,
}));
vi.mock('../../infrastructure/browser-download', () => files);

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'alice', email: 'alice@example.test', name: 'Alice' }, loading: false, logout: vi.fn() }),
}));

import { FoyerPage } from './FoyerPage';

const blob = new Blob(['{}']);

function renderPage(kind: 'COMMON' | 'PERSONAL' = 'COMMON') {
  preferences.setSpaceKind(kind);
  const value: HouseholdContextValue = { household: testHousehold, loading: false, offline: false, failed: false, reload: vi.fn(), setHousehold: vi.fn() };
  render(
    <MemoryRouter>
      <HouseholdContext.Provider value={value}>
        <SpaceProvider>
          <FoyerPage />
        </SpaceProvider>
      </HouseholdContext.Provider>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe('FoyerPage « Mes données »', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    files.saveFile.mockReset();
    api.fetchContribution.mockResolvedValue({ mode: 'EQUAL', commonNeedCents: 0, incomplete: true, shortfallCents: 0, shares: [] });
    api.fetchSafetyNet.mockResolvedValue({ safetyNet: null, progress: null });
    api.fetchContributionStatus.mockResolvedValue({ month: '2026-11', incomplete: true, members: [], totalExpectedCents: null, totalPaidCents: 0 });
    api.downloadExport.mockResolvedValue({ blob, filename: 'budget-export-2026-10-29.json' });
    api.downloadTransactionsCsv.mockResolvedValue({ blob, filename: 'operations-2026-01-01_2026-10-30.csv' });
  });

  it('links to the monthly review', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Ma revue du mois' })).toHaveAttribute('href', '/revue');
  });

  it('reassures about what the backup contains: only what you can access, never another member’s personal space', () => {
    renderPage();
    const heading = screen.getByRole('heading', { name: 'Mes données' });
    const section = heading.closest('section') as HTMLElement;
    expect(section).toHaveTextContent('uniquement les données auxquelles vous avez accès');
    expect(section).toHaveTextContent('L’espace perso d’un autre membre n’en fait jamais partie.');
  });

  describe('JSON backup', () => {
    it('downloads the backup, hands it to the browser and confirms with the file name', async () => {
      const user = renderPage();
      await user.click(screen.getByRole('button', { name: 'Télécharger une sauvegarde (JSON)' }));
      await waitFor(() => expect(files.saveFile).toHaveBeenCalledWith({ blob, filename: 'budget-export-2026-10-29.json' }));
      expect(api.downloadExport).toHaveBeenCalledTimes(1);
      expect(await screen.findByText('Fichier téléchargé : budget-export-2026-10-29.json')).toBeInTheDocument();
    });

    it('disables the buttons and says so while downloading', async () => {
      let release: (value: unknown) => void = () => undefined;
      api.downloadExport.mockReturnValue(new Promise((resolve) => (release = resolve)));
      const user = renderPage();
      await user.click(screen.getByRole('button', { name: 'Télécharger une sauvegarde (JSON)' }));
      expect(await screen.findByRole('button', { name: 'Téléchargement…' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Télécharger le CSV' })).toBeDisabled();
      release({ blob, filename: 'f.json' });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Télécharger une sauvegarde (JSON)' })).toBeEnabled());
    });

    it('explains a missing household (404) and saves nothing', async () => {
      api.downloadExport.mockRejectedValue(new ApiError(404, 'Foyer introuvable'));
      const user = renderPage();
      await user.click(screen.getByRole('button', { name: 'Télécharger une sauvegarde (JSON)' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Aucun foyer n’a été trouvé');
      expect(files.saveFile).not.toHaveBeenCalled();
    });

    it('explains a network failure and offers to retry', async () => {
      api.downloadExport.mockRejectedValueOnce(new NetworkError());
      const user = renderPage();
      await user.click(screen.getByRole('button', { name: 'Télécharger une sauvegarde (JSON)' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Pas de connexion');
      await user.click(screen.getByRole('button', { name: 'Réessayer' }));
      expect(await screen.findByText('Fichier téléchargé : budget-export-2026-10-29.json')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('CSV export', () => {
    const csvForm = () => screen.getByRole('form', { name: 'Exporter les opérations (CSV)' });

    it('proposes the selected space and 1 January to today by default', () => {
      renderPage('PERSONAL');
      expect(screen.getByLabelText('Espace')).toHaveValue('s-alice');
      expect(screen.getByLabelText('Du')).toHaveValue(`${new Date().getFullYear()}-01-01`);
      expect(screen.getByLabelText('Au')).toHaveValue(todayInputValue());
    });

    it('lets you pick either space of the household', async () => {
      const user = renderPage();
      const select = screen.getByLabelText('Espace');
      expect(Array.from((select as HTMLSelectElement).options).map((option) => option.textContent)).toEqual(['Espace commun', 'Mon espace perso']);
      await user.selectOptions(select, 's-alice');
      fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2026-09-01' } });
      fireEvent.change(screen.getByLabelText('Au'), { target: { value: '2026-09-30' } });
      await user.click(screen.getByRole('button', { name: 'Télécharger le CSV' }));
      await waitFor(() => expect(api.downloadTransactionsCsv).toHaveBeenCalledWith('s-alice', { from: '2026-09-01', to: '2026-09-30' }));
    });

    it('downloads the CSV of the selected space and confirms the file name', async () => {
      const user = renderPage();
      fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2026-01-01' } });
      fireEvent.change(screen.getByLabelText('Au'), { target: { value: '2026-10-30' } });
      await user.click(screen.getByRole('button', { name: 'Télécharger le CSV' }));
      await waitFor(() => expect(api.downloadTransactionsCsv).toHaveBeenCalledWith('s-common', { from: '2026-01-01', to: '2026-10-30' }));
      expect(files.saveFile).toHaveBeenCalledWith({ blob, filename: 'operations-2026-01-01_2026-10-30.csv' });
      expect(await screen.findByText('Fichier téléchargé : operations-2026-01-01_2026-10-30.csv')).toBeInTheDocument();
    });

    it('refuses a period over 366 days before calling the server', async () => {
      const user = renderPage();
      fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2025-01-01' } });
      fireEvent.change(screen.getByLabelText('Au'), { target: { value: '2026-10-30' } });
      await user.click(screen.getByRole('button', { name: 'Télécharger le CSV' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('366 jours au plus');
      expect(api.downloadTransactionsCsv).not.toHaveBeenCalled();
    });

    it('accepts exactly 366 days', async () => {
      const user = renderPage();
      fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2025-11-01' } });
      fireEvent.change(screen.getByLabelText('Au'), { target: { value: '2026-11-01' } });
      await user.click(screen.getByRole('button', { name: 'Télécharger le CSV' }));
      await waitFor(() => expect(api.downloadTransactionsCsv).toHaveBeenCalledTimes(1));
    });

    it('refuses a reversed period and missing dates, field by field', async () => {
      const user = renderPage();
      fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2026-10-30' } });
      fireEvent.change(screen.getByLabelText('Au'), { target: { value: '2026-10-01' } });
      await user.click(screen.getByRole('button', { name: 'Télécharger le CSV' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('La date de fin doit être le même jour ou après la date de début.');
      fireEvent.change(screen.getByLabelText('Du'), { target: { value: '' } });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Télécharger le CSV' }));
      expect(await screen.findByText('Choisissez la date de début.')).toBeInTheDocument();
      expect(screen.getByLabelText('Du')).toHaveAttribute('aria-invalid', 'true');
      expect(api.downloadTransactionsCsv).not.toHaveBeenCalled();
      expect(csvForm()).toBeInTheDocument();
    });

    it('explains a server refusal and a network failure without losing the dates', async () => {
      api.downloadTransactionsCsv.mockRejectedValueOnce(new ApiError(400, 'x')).mockRejectedValueOnce(new NetworkError());
      const user = renderPage();
      fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2026-09-01' } });
      fireEvent.change(screen.getByLabelText('Au'), { target: { value: '2026-09-30' } });
      await user.click(screen.getByRole('button', { name: 'Télécharger le CSV' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Le serveur a refusé cette période');
      await user.click(screen.getByRole('button', { name: 'Télécharger le CSV' }));
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Pas de connexion'));
      expect(screen.getByLabelText('Du')).toHaveValue('2026-09-01');
      expect(screen.getByLabelText('Au')).toHaveValue('2026-09-30');
    });

    it('explains a missing household (404)', async () => {
      api.downloadTransactionsCsv.mockRejectedValue(new ApiError(404, 'x'));
      const user = renderPage();
      await user.click(screen.getByRole('button', { name: 'Télécharger le CSV' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Aucun foyer n’a été trouvé');
    });
  });
});
