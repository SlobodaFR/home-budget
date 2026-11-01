import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseExtractionJob } from '../../domain/debt-extraction';
import { ApiError, NetworkError } from '../../infrastructure/api-client';
import { debtsSummary, rawExtractedField, rawExtractionJob, rawExtractionResult } from '../../test/fixtures';
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
  fetchDebtExtractionCapabilities: vi.fn(),
  startDebtExtraction: vi.fn(),
  fetchDebtExtraction: vi.fn(),
  deleteDebtExtraction: vi.fn(),
}));

vi.mock('../../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/api-client')>()),
  apiClient: api,
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'alice', email: 'alice@example.test', name: 'Alice' }, loading: false, logout: vi.fn() }),
}));

import { DettesPage } from './DettesPage';

const MAX = 1024 * 1024;
const pdf = () => new File(['%PDF-1.4 contenu du contrat'], 'contrat-pret.pdf', { type: 'application/pdf' });
const job = (raw: Record<string, unknown>) => {
  const parsed = parseExtractionJob(raw);
  if (!parsed) {
    throw new Error('job illisible');
  }
  return parsed;
};
const done = (result: Record<string, unknown> = rawExtractionResult()) => job({ status: 'DONE', stage: null, progressPercent: 100, result });
const plain = (value: string | null | undefined) => (value ?? '').replace(/[\s  ]/g, ' ');

const flush = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

async function openForm() {
  renderInApp(<DettesPage />, { path: '/dettes', kind: 'COMMON' });
  await flush();
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter mon premier crédit' }));
  await flush();
}

const importButton = () => screen.queryByRole('button', { name: 'Importer depuis un contrat (PDF ou photo)' });
const pick = (file: File, label = 'Fichier du contrat') => fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

/** Ouvre l'import, choisit un fichier, accepte le consentement et laisse le travail se terminer. */
async function readContract(result: Record<string, unknown> = rawExtractionResult()) {
  api.fetchDebtExtraction.mockResolvedValue(done(result));
  click('Importer depuis un contrat (PDF ou photo)');
  pick(pdf());
  click('Lire ce contrat');
  await flush(1500);
}

describe('DettesPage — import d’un contrat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchAccounts.mockResolvedValue([]);
    api.fetchRecurring.mockResolvedValue([]);
    api.fetchDebts.mockResolvedValue([]);
    api.fetchDebtsSummary.mockResolvedValue(debtsSummary({ activeCount: 0 }));
    api.createDebt.mockResolvedValue(null);
    api.fetchDebtExtractionCapabilities.mockResolvedValue({ available: true, maxFileBytes: MAX, maxPages: 40 });
    api.startDebtExtraction.mockResolvedValue({ jobId: 'job-1', expiresAtMs: null });
    api.fetchDebtExtraction.mockResolvedValue(job(rawExtractionJob()));
    api.deleteDebtExtraction.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('the entry point', () => {
    it('is offered in the new credit form when the server can read contracts', async () => {
      await openForm();
      expect(importButton()).toBeInTheDocument();
    });

    it('is hidden when the server has no reading tools', async () => {
      api.fetchDebtExtractionCapabilities.mockResolvedValue({ available: false, maxFileBytes: MAX, maxPages: null });
      await openForm();
      expect(importButton()).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ajouter le crédit' })).toBeInTheDocument();
    });

    it('is hidden on a network error, and the form still works', async () => {
      api.fetchDebtExtractionCapabilities.mockRejectedValue(new NetworkError());
      await openForm();
      expect(importButton()).not.toBeInTheDocument();
      expect(screen.getByLabelText('Nom du crédit')).toBeInTheDocument();
    });

    it('is hidden when the backend does not know the call at all', async () => {
      (api as Record<string, unknown>).fetchDebtExtractionCapabilities = undefined;
      await openForm();
      expect(importButton()).not.toBeInTheDocument();
      api.fetchDebtExtractionCapabilities = vi.fn();
    });

    it('is not offered when modifying an existing credit', async () => {
      const { debt } = await import('../../test/fixtures');
      api.fetchDebts.mockResolvedValue([debt({ id: 'd1', name: 'Prêt auto' })]);
      renderInApp(<DettesPage />, { path: '/dettes', kind: 'COMMON' });
      await flush();
      fireEvent.click(screen.getByRole('button', { name: 'Modifier Prêt auto' }));
      await flush();
      expect(api.fetchDebtExtractionCapabilities).not.toHaveBeenCalled();
      expect(importButton()).not.toBeInTheDocument();
    });

    it('disappears as soon as something has been typed, so nothing is overwritten', async () => {
      await openForm();
      expect(importButton()).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Nom du crédit'), { target: { value: 'Prêt auto' } });
      expect(importButton()).not.toBeInTheDocument();
    });
  });

  describe('choosing the file and the consent', () => {
    it('lets the person pick a file or take a photo, and states the limits', async () => {
      await openForm();
      click('Importer depuis un contrat (PDF ou photo)');
      expect(screen.getByRole('dialog', { name: 'Importer un contrat' })).toBeInTheDocument();
      const file = screen.getByLabelText('Fichier du contrat');
      expect(file).toHaveAttribute('type', 'file');
      expect(file).toHaveAttribute('accept', 'application/pdf,image/png,image/jpeg');
      const photo = screen.getByLabelText('Photo du contrat');
      expect(photo).toHaveAttribute('capture', 'environment');
      expect(photo).toHaveAttribute('accept', 'image/jpeg,image/png');
      expect(screen.getByText(/PDF, PNG ou JPEG, 1 Mo au plus, 40 pages au plus/)).toBeInTheDocument();
    });

    it('refuses an unsupported type before sending anything', async () => {
      await openForm();
      click('Importer depuis un contrat (PDF ou photo)');
      pick(new File(['a;b'], 'releve.csv', { type: 'text/csv' }));
      expect(screen.getByRole('alert')).toHaveTextContent('Ce type de fichier n’est pas pris en charge');
      expect(screen.queryByRole('button', { name: 'Lire ce contrat' })).not.toBeInTheDocument();
      expect(api.startDebtExtraction).not.toHaveBeenCalled();
    });

    it('refuses a file that is too big before sending anything', async () => {
      await openForm();
      click('Importer depuis un contrat (PDF ou photo)');
      pick(new File([new Uint8Array(MAX + 1)], 'gros.pdf', { type: 'application/pdf' }));
      expect(screen.getByRole('alert')).toHaveTextContent(/trop volumineux.*1 Mo/);
      expect(api.startDebtExtraction).not.toHaveBeenCalled();
    });

    it('shows the consent text every time and sends nothing until the person agrees', async () => {
      await openForm();
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (attempt === 0) {
          click('Importer depuis un contrat (PDF ou photo)');
        }
        pick(pdf());
        expect(screen.getByText('Le contrat est lu sur le serveur de l’application pour en extraire des informations, puis supprimé immédiatement. Il n’est pas conservé.')).toBeInTheDocument();
        expect(screen.getByText('contrat-pret.pdf')).toBeInTheDocument();
        expect(api.startDebtExtraction).not.toHaveBeenCalled();
        if (attempt === 0) {
          click('Choisir un autre fichier');
        }
      }
      click('Lire ce contrat');
      await flush();
      expect(api.startDebtExtraction).toHaveBeenCalledTimes(1);
      expect(api.startDebtExtraction).toHaveBeenCalledWith('s-common', expect.any(File));
    });

    it('goes back to the form without sending anything', async () => {
      await openForm();
      click('Importer depuis un contrat (PDF ou photo)');
      click('Revenir au formulaire');
      expect(screen.getByLabelText('Nom du crédit')).toBeInTheDocument();
      expect(api.startDebtExtraction).not.toHaveBeenCalled();
    });

    it('goes back to the form with Escape, and keeps the form as it was', async () => {
      await openForm();
      click('Importer depuis un contrat (PDF ou photo)');
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.getByLabelText('Nom du crédit')).toBeInTheDocument();
      expect(importButton()).toBeInTheDocument();
    });
  });

  describe('while the contract is being read', () => {
    async function startReading() {
      await openForm();
      click('Importer depuis un contrat (PDF ou photo)');
      pick(pdf());
      click('Lire ce contrat');
      await flush();
    }

    it('shows an accessible progress bar and the stage', async () => {
      api.fetchDebtExtraction.mockResolvedValue(job(rawExtractionJob({ stage: 'OCR', progressPercent: 40 })));
      await startReading();
      await flush(1500);
      const bar = screen.getByRole('progressbar');
      expect(bar).toHaveAttribute('aria-valuemin', '0');
      expect(bar).toHaveAttribute('aria-valuemax', '100');
      expect(bar).toHaveAttribute('aria-valuenow', '40');
      expect(bar).toHaveAttribute('aria-valuetext', 'Reconnaissance des caractères, 40 %');
      expect(screen.getByText('Reconnaissance des caractères (40 %)')).toBeInTheDocument();

      api.fetchDebtExtraction.mockResolvedValue(job(rawExtractionJob({ stage: 'PARSING', progressPercent: 85 })));
      await flush(1500);
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '85');
      expect(screen.getByText('Analyse (85 %)')).toBeInTheDocument();
    });

    it('cancels: stops following, deletes the job on the server and goes back to the choice of file', async () => {
      await startReading();
      await flush(1500);
      click('Annuler');
      expect(api.deleteDebtExtraction).toHaveBeenCalledTimes(1);
      expect(api.deleteDebtExtraction).toHaveBeenCalledWith('job-1');
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Fichier du contrat')).toBeInTheDocument();
      const polls = api.fetchDebtExtraction.mock.calls.length;
      await flush(30_000);
      expect(api.fetchDebtExtraction).toHaveBeenCalledTimes(polls);
    });

    it('deletes the job and clears every timer when the sheet is closed in the middle', async () => {
      await startReading();
      await flush(1500);
      fireEvent.keyDown(document, { key: 'Escape' }); // retour au formulaire
      expect(api.deleteDebtExtraction).toHaveBeenCalledWith('job-1');
      click('Fermer');
      await flush(60_000);
      expect(vi.getTimerCount()).toBe(0);
      expect(api.deleteDebtExtraction).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['a 429', new ApiError(429, 'trop'), 'Une lecture est déjà en cours ou vous en avez fait trop cette heure'],
      ['a 503', new ApiError(503, 'ocr'), 'La lecture des contrats n’est pas disponible'],
      ['a 400', new ApiError(400, 'mauvais'), 'Ce fichier n’a pas pu être lu'],
      ['no network', new NetworkError(), 'Pas de connexion'],
    ])('explains %s when sending', async (_name, error, text) => {
      api.startDebtExtraction.mockRejectedValue(error);
      await startReading();
      expect(screen.getByRole('alert')).toHaveTextContent(text);
      expect(api.deleteDebtExtraction).not.toHaveBeenCalled();
      click('Saisir à la main');
      expect(screen.getByLabelText('Nom du crédit')).toBeInTheDocument();
    });

    it('shows the message of a failed reading and removes the job', async () => {
      api.fetchDebtExtraction.mockResolvedValue(job({ status: 'FAILED', error: { message: 'Le PDF est protégé par un mot de passe.' } }));
      await startReading();
      await flush(1500);
      expect(screen.getByRole('alert')).toHaveTextContent('Le PDF est protégé par un mot de passe.');
      expect(api.deleteDebtExtraction).toHaveBeenCalledWith('job-1');
    });

    it('says the result expired when the server forgot the job (404), then offers a new try', async () => {
      api.fetchDebtExtraction.mockRejectedValue(new ApiError(404, 'introuvable'));
      await startReading();
      await flush(1500);
      expect(screen.getByRole('alert')).toHaveTextContent('Le résultat n’est plus disponible');
      click('Choisir un autre fichier');
      expect(screen.getByLabelText('Fichier du contrat')).toBeInTheDocument();
    });

    it('lets the person resume after a lost connection', async () => {
      api.fetchDebtExtraction.mockRejectedValue(new NetworkError());
      await startReading();
      await flush(60_000);
      expect(screen.getByRole('alert')).toHaveTextContent('Pas de connexion');
      api.fetchDebtExtraction.mockResolvedValue(done());
      click('Reprendre le suivi');
      await flush();
      expect(screen.getByRole('button', { name: 'Préremplir le formulaire' })).toBeInTheDocument();
    });
  });

  describe('reviewing the proposals', () => {
    it('lists each field with its label, value, confidence in words, source excerpt and page', async () => {
      await openForm();
      await readContract();
      const list = screen.getByRole('list', { name: 'Informations trouvées dans le contrat' });
      const rows = within(list).getAllByRole('listitem');
      expect(rows).toHaveLength(5);

      const lender = rows.find((row) => row.textContent?.includes('Prêteur')) as HTMLElement;
      expect(lender).toHaveTextContent('Banque Exemple');
      expect(lender).toHaveTextContent('Sûr');
      expect(lender).toHaveTextContent('page 1');
      expect(lender).toHaveTextContent('D’après : « Établissement prêteur : Banque Exemple SA »');

      const rate = rows.find((row) => row.textContent?.includes('Taux annuel')) as HTMLElement;
      expect(plain(rate.textContent)).toContain('3,45 %');
      expect(rate).toHaveTextContent('À vérifier');
      expect(rate).toHaveTextContent('Vérifiez cette valeur dans votre contrat');

      const monthly = rows.find((row) => row.textContent?.includes('Mensualité')) as HTMLElement;
      expect(plain(monthly.textContent)).toContain('854 €');
      expect(monthly).toHaveTextContent('Douteux');
      expect(monthly).toHaveTextContent('Lecture peu fiable');
    });

    it('checks only the sure values by default', async () => {
      await openForm();
      await readContract();
      expect(screen.getByRole('checkbox', { name: /Prêteur/ })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: /Capital emprunté/ })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: /Durée initiale/ })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: /Taux annuel/ })).not.toBeChecked();
      expect(screen.getByRole('checkbox', { name: /Mensualité/ })).not.toBeChecked();
      expect(screen.getByText('3 informations cochées sur 5.')).toBeInTheDocument();
    });

    it('shows the warnings, the fields not found and what never comes from a contract', async () => {
      await openForm();
      await readContract();
      expect(screen.getByRole('region', { name: 'À savoir avant de continuer' })).toHaveTextContent('Plusieurs taux trouvés (3,45 % et 3,85 %)');
      expect(screen.getByText(/Non trouvé dans le document : Référence du contrat, Type de taux, Date de début, Assurance, Frais de dossier, Garantie : à saisir à la main\./)).toBeInTheDocument();
      expect(screen.getByText(/Le nom du crédit, le capital restant dû et le jour de prélèvement ne se lisent pas dans un contrat/)).toBeInTheDocument();
      expect(screen.getByText(/lu par reconnaissance de caractères/)).toBeInTheDocument();
    });

    it('explains the three confidence levels', async () => {
      await openForm();
      await readContract();
      const legend = screen.getByText(/Que veulent dire/).closest('details') as HTMLElement;
      expect(legend).toHaveTextContent('Sûr : le libellé et la valeur sont nets');
      expect(legend).toHaveTextContent('À vérifier :');
      expect(legend).toHaveTextContent('Douteux :');
    });

    it('says plainly when nothing could be read', async () => {
      await openForm();
      await readContract(rawExtractionResult({ fields: [], warnings: ['Ce document ne semble pas contenir d’offre de prêt.'] }));
      expect(screen.getByText(/Aucune information n’a pu être lue/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Préremplir le formulaire' })).toBeDisabled();
      expect(screen.getByText(/Ce document ne semble pas contenir d’offre de prêt/)).toBeInTheDocument();
      expect(screen.getByText(/Non trouvé dans le document : Prêteur/)).toBeInTheDocument();
    });

    it('does not let a value outside the limits of the form be checked', async () => {
      await openForm();
      await readContract({ ...rawExtractionResult(), fields: [rawExtractedField('lender', 'LCL'), rawExtractedField('initialTermMonths', 900, 'HIGH')] });
      const term = screen.getByRole('checkbox', { name: /Durée initiale/ });
      expect(term).toBeDisabled();
      expect(term).not.toBeChecked();
      expect(screen.getByText(/Cette valeur ne peut pas être reprise : valeur hors des limites du formulaire/)).toBeInTheDocument();
    });

    it('never puts the proposals in the form until the person fills it in', async () => {
      await openForm();
      await readContract();
      expect(api.createDebt).not.toHaveBeenCalled();
      expect(window.localStorage.length).toBeLessThanOrEqual(1);
    });
  });

  describe('filling in the form', () => {
    it('applies only the checked fields, deletes the job, saves nothing, and marks what was filled', async () => {
      await openForm();
      await readContract();
      // On décoche une valeur sûre, on coche une valeur douteuse.
      fireEvent.click(screen.getByRole('checkbox', { name: /Prêteur/ }));
      fireEvent.click(screen.getByRole('checkbox', { name: /Mensualité/ }));
      expect(screen.getByText('3 informations cochées sur 5.')).toBeInTheDocument();
      click('Préremplir le formulaire');
      await flush();

      expect(api.deleteDebtExtraction).toHaveBeenCalledTimes(1);
      expect(api.deleteDebtExtraction).toHaveBeenCalledWith('job-1');
      expect(api.createDebt).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog', { name: 'Nouveau crédit' })).toBeInTheDocument();

      expect(screen.getByLabelText('Capital emprunté')).toHaveValue('150000');
      expect(screen.getByLabelText('Mensualité')).toHaveValue('854');
      expect(screen.getByLabelText('Durée : années')).toHaveValue('20');
      // Décochés ou absents : restent vides.
      expect(screen.getByLabelText(/Prêteur/)).toHaveValue('');
      expect(screen.getByLabelText('Taux annuel')).toHaveValue('');
      expect(screen.getByLabelText('Capital restant dû')).toHaveValue('');
      expect(screen.getByLabelText('Nom du crédit')).toHaveValue('');
      expect(screen.getByLabelText('Assurance par mois (facultatif)')).toHaveValue('');

      const marks = screen.getAllByTestId('prefill-mark');
      expect(marks).toHaveLength(3);
      expect(marks[0]).toHaveTextContent('Prérempli depuis le contrat : à vérifier');
      expect(marks[1]).toHaveTextContent('lecture peu sûre'); // la mensualité « douteuse »

      const report = screen.getByRole('status', { name: 'Résultat de l’import du contrat' });
      expect(report).toHaveTextContent('3 informations ont été reprises');
      expect(report).toHaveTextContent('le nom du crédit, son type, le capital restant dû et le jour de prélèvement');
    });

    it('removes the mark of a field as soon as it is edited', async () => {
      await openForm();
      await readContract();
      click('Préremplir le formulaire');
      await flush();
      expect(screen.getAllByTestId('prefill-mark')).toHaveLength(3);
      fireEvent.change(screen.getByLabelText('Capital emprunté'), { target: { value: '140000' } });
      expect(screen.getAllByTestId('prefill-mark')).toHaveLength(2);
      fireEvent.change(screen.getByLabelText(/Prêteur/), { target: { value: 'LCL' } });
      fireEvent.change(screen.getByLabelText('Durée : années'), { target: { value: '25' } });
      expect(screen.queryAllByTestId('prefill-mark')).toHaveLength(0);
    });

    it('lets the person finish and save with their own corrections', async () => {
      await openForm();
      await readContract();
      fireEvent.click(screen.getByRole('checkbox', { name: /Taux annuel/ }));
      fireEvent.click(screen.getByRole('checkbox', { name: /Mensualité/ }));
      click('Préremplir le formulaire');
      await flush();
      fireEvent.change(screen.getByLabelText('Nom du crédit'), { target: { value: 'Prêt maison' } });
      fireEvent.change(screen.getByLabelText('Capital restant dû'), { target: { value: '150000' } });
      click('Ajouter le crédit');
      await flush();

      expect(api.createDebt).toHaveBeenCalledTimes(1);
      expect(api.createDebt).toHaveBeenCalledWith(
        's-common',
        expect.objectContaining({ name: 'Prêt maison', lender: 'Banque Exemple', principalCents: 15000000, remainingCents: 15000000, annualRatePercent: 3.45, monthlyPaymentCents: 85400, initialTermMonths: 240 }),
      );
    });

    it('does not save when the form is incomplete after the prefill: the person has to fill the rest', async () => {
      await openForm();
      await readContract();
      click('Préremplir le formulaire');
      await flush();
      click('Ajouter le crédit');
      expect(api.createDebt).not.toHaveBeenCalled();
      expect(screen.getByText(/Donnez un nom à ce crédit/)).toBeInTheDocument();
    });

    it('reports a value it had to leave out, and opens the optional block when it fills it', async () => {
      await openForm();
      await readContract({
        ...rawExtractionResult(),
        fields: [rawExtractedField('contractReference', 'PRET-12345'), rawExtractedField('insuranceRatePercent', 0.36, 'HIGH'), rawExtractedField('guaranteeCents', 150000, 'HIGH')],
      });
      click('Préremplir le formulaire');
      await flush();
      expect(screen.getByLabelText('Référence du contrat')).toHaveValue('PRET-12345');
      expect(screen.getByTestId('contract-details')).toHaveAttribute('open');
      const report = screen.getByRole('status', { name: 'Résultat de l’import du contrat' });
      expect(report).toHaveTextContent('1 information a été reprise');
      expect(report).toHaveTextContent('Non repris : Taux de l’assurance');
      expect(report).toHaveTextContent('Frais de garantie');
      click('Masquer ce message');
      expect(screen.queryByRole('status', { name: 'Résultat de l’import du contrat' })).not.toBeInTheDocument();
    });

    it('fills the percent insurance and the guarantee through their own fields', async () => {
      await openForm();
      await readContract({
        ...rawExtractionResult(),
        fields: [
          rawExtractedField('insuranceMode', 'PERCENT_INITIAL'),
          rawExtractedField('insuranceRatePercent', 0.36),
          rawExtractedField('guaranteeKind', 'MORTGAGE'),
          rawExtractedField('guaranteeCents', 150000),
          rawExtractedField('rateType', 'VARIABLE'),
          rawExtractedField('startDate', '2026-10-30'),
        ],
      });
      click('Préremplir le formulaire');
      await flush();
      expect(screen.getByLabelText('Comment l’assurance est-elle calculée ?')).toHaveValue('PERCENT_INITIAL');
      expect(screen.getByLabelText('Taux annuel de l’assurance')).toHaveValue('0,36');
      expect(screen.getByLabelText('Garantie')).toHaveValue('MORTGAGE');
      expect(screen.getByLabelText('Frais de garantie')).toHaveValue('1500');
      expect(screen.getByRole('button', { name: 'Variable' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText('Date de début du crédit')).toHaveValue('2026-10-30');
      expect(screen.getAllByTestId('prefill-mark').length).toBeGreaterThanOrEqual(6);
    });

    it('applies nothing and deletes the job when the person cancels the review', async () => {
      await openForm();
      await readContract();
      click('Annuler et saisir à la main');
      expect(api.deleteDebtExtraction).toHaveBeenCalledTimes(1);
      expect(api.deleteDebtExtraction).toHaveBeenCalledWith('job-1');
      expect(screen.getByLabelText('Capital emprunté')).toHaveValue('');
      expect(screen.queryAllByTestId('prefill-mark')).toHaveLength(0);
      expect(importButton()).toBeInTheDocument();
    });

    it('deletes the job when the whole sheet is closed on the review screen', async () => {
      await openForm();
      await readContract();
      click('Fermer');
      expect(api.deleteDebtExtraction).toHaveBeenCalledWith('job-1');
      click('Fermer');
      expect(api.deleteDebtExtraction).toHaveBeenCalledTimes(1);
    });

    it('keeps nothing of the contract on the device', async () => {
      await openForm();
      await readContract();
      click('Préremplir le formulaire');
      await flush();
      const stored = Object.keys(window.localStorage).map((key) => `${key}=${window.localStorage.getItem(key)}`).join('\n');
      expect(stored).not.toContain('Banque Exemple');
      expect(stored).not.toContain('contrat-pret');
      expect(stored).not.toContain('150000');
      expect(stored).not.toContain('PDF');
    });
  });
});
