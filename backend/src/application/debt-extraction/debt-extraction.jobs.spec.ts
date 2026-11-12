import type { Mock } from 'vitest';
import { Logger, NotFoundException } from '@nestjs/common';
import { DocumentExtractionError } from '../../domain/contract-extraction/document-text-extractor';
import { DomainError } from '../../domain/shared/domain-error';
import { IMMO_CLEAN } from '../../testing/contract-fixtures';
import { FakeClock } from '../../testing/fake-clock';
import {
  FakeDocumentTextExtractor,
  createGate,
} from '../../testing/fake-document-text-extractor';
import { SpyTelemetry } from '../../testing/spy-telemetry';
import { SpaceAccessService } from '../household/space-access.service';
import {
  DebtExtractionJobs,
  EXTRACTION_TTL_MS,
  GENERIC_FAILURE_MESSAGE,
  MAX_EXTRACTIONS_PER_HOUR,
} from './debt-extraction.jobs';

const PDF = Buffer.from('%PDF-1.4\n% fictif\n');
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);

function setup() {
  const extractor = new FakeDocumentTextExtractor();
  const clock = FakeClock.at('2026-10-31T10:00:00Z');
  const access = {
    requireSpace: vi.fn<() => Promise<object>>().mockResolvedValue({}),
  } as unknown as SpaceAccessService & { requireSpace: Mock };
  const telemetry = new SpyTelemetry();
  const jobs = new DebtExtractionJobs(extractor, access, clock, telemetry);
  return { extractor, clock, access, jobs, telemetry };
}

describe('DebtExtractionJobs', () => {
  beforeAll(() => {
    Logger.overrideLogger(false);
  });
  afterAll(() => {
    Logger.overrideLogger(['log', 'warn', 'error']);
  });

  describe('déroulement', () => {
    it('traite un document et expose le résultat à son propriétaire', async () => {
      const { jobs, extractor } = setup();
      extractor.pages = [IMMO_CLEAN];
      const started = await jobs.start('alice', 'space-1', PDF);
      expect(started.jobId).toMatch(/^[0-9a-f-]{36}$/);
      await jobs.idle();
      const view = jobs.get('alice', started.jobId);
      expect(view.status).toBe('DONE');
      expect(view.stage).toBeNull();
      expect(view.progressPercent).toBe(100);
      expect(view.error).toBeUndefined();
      expect(view.result).toMatchObject({
        source: 'TEXT_LAYER',
        pages: 1,
        engine: null,
      });
      expect(
        view.result?.fields.find((f) => f.field === 'principalCents')?.value,
      ).toBe(15000000);
    });

    it('annonce une expiration à 15 minutes', async () => {
      const { jobs, clock } = setup();
      const started = await jobs.start('alice', 's', PDF);
      expect(new Date(started.expiresAt).getTime()).toBe(
        clock.now().getTime() + EXTRACTION_TTL_MS,
      );
    });

    it('passe par PENDING puis RUNNING avec progression et étape', async () => {
      const { jobs, extractor } = setup();
      const { gate, open } = createGate();
      extractor.gate = gate;
      const { jobId } = await jobs.start('alice', 's', PDF);
      await new Promise((resolve) => setImmediate(resolve));
      const running = jobs.get('alice', jobId);
      expect(running.status).toBe('RUNNING');
      expect(running.stage).toBe('OCR');
      expect(running.progressPercent).toBeGreaterThan(0);
      expect(running.progressPercent).toBeLessThan(100);
      expect(running.result).toBeUndefined();
      open();
      await jobs.idle();
      expect(jobs.get('alice', jobId).status).toBe('DONE');
    });

    it('vérifie l’accès à l’espace comme la création d’un crédit', async () => {
      const { jobs, access } = setup();
      access.requireSpace.mockRejectedValueOnce(
        new NotFoundException('Espace introuvable'),
      );
      await expect(jobs.start('alice', 'autre', PDF)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(access.requireSpace).toHaveBeenCalledWith('alice', 'autre');
    });

    it('rejette un fichier absent, trop gros ou d’un autre type (octets)', async () => {
      const { jobs } = setup();
      await expect(jobs.start('alice', 's', undefined)).rejects.toBeInstanceOf(
        DomainError,
      );
      await expect(
        jobs.start('alice', 's', Buffer.from('juste du texte')),
      ).rejects.toThrow(/Format non pris en charge/);
      await expect(
        jobs.start('alice', 's', Buffer.alloc(10 * 1024 * 1024 + 1, 0x25)),
      ).rejects.toThrow(/10 Mo/);
    });

    it('relaie le refus d’un PDF protégé ou illisible et ne consomme pas le quota', async () => {
      const { jobs, extractor } = setup();
      extractor.rejectPdf = 'Ce PDF est protégé par un mot de passe';
      for (let i = 0; i < MAX_EXTRACTIONS_PER_HOUR + 2; i++) {
        await expect(jobs.start('alice', 's', PDF)).rejects.toThrow(/protégé/);
      }
      extractor.rejectPdf = null;
      await expect(jobs.start('alice', 's', PDF)).resolves.toBeDefined();
    });

    it('503 OCR_UNAVAILABLE quand les outils sont absents', async () => {
      const { jobs, extractor } = setup();
      extractor.available = false;
      await expect(jobs.start('alice', 's', PDF)).rejects.toMatchObject({
        response: { code: 'OCR_UNAVAILABLE' },
        status: 503,
      });
      expect(extractor.inspectCalls).toBe(0);
    });
  });

  describe('télémétrie', () => {
    it('rapporte la fin d’un job réussi : source et nombre de champs, avec l’utilisateur', async () => {
      const { jobs, telemetry } = setup();
      const { jobId } = await jobs.start('alice', 'space-1', PDF);
      await jobs.idle();
      const fields = jobs.get('alice', jobId).result!.fields.length;
      expect(telemetry.captured).toEqual([
        {
          event: {
            name: 'debt_extraction_finished',
            properties: { outcome: 'done', source: 'TEXT_LAYER', fields },
          },
          userId: 'alice',
        },
      ]);
    });

    it('rapporte un échec sans détail ni contenu', async () => {
      const { jobs, extractor, telemetry } = setup();
      extractor.failWith = new Error('secret du document');
      await jobs.start('alice', 'space-1', PDF);
      await jobs.idle();
      expect(telemetry.captured).toEqual([
        {
          event: {
            name: 'debt_extraction_finished',
            properties: { outcome: 'failed' },
          },
          userId: 'alice',
        },
      ]);
      expect(JSON.stringify(telemetry.captured)).not.toContain('secret');
    });

    it('ne rapporte rien pour un job supprimé pendant le traitement', async () => {
      const { jobs, extractor, telemetry } = setup();
      const { gate, open } = createGate();
      extractor.gate = gate;
      const { jobId } = await jobs.start('alice', 'space-1', PDF);
      await new Promise((resolve) => setImmediate(resolve));
      jobs.delete('alice', jobId);
      open();
      await jobs.idle();
      expect(telemetry.captured).toEqual([]);
    });
  });

  describe('échec', () => {
    it('affiche le message français d’une erreur de lecture connue', async () => {
      const { jobs, extractor } = setup();
      extractor.failWith = new DocumentExtractionError(
        'Le traitement a pris trop de temps.',
      );
      const { jobId } = await jobs.start('alice', 's', PDF);
      await jobs.idle();
      expect(jobs.get('alice', jobId)).toMatchObject({
        status: 'FAILED',
        stage: null,
        error: { message: 'Le traitement a pris trop de temps.' },
      });
      expect(jobs.get('alice', jobId).result).toBeUndefined();
    });

    it('masque toute autre erreur (qui pourrait citer le document)', async () => {
      const { jobs, extractor } = setup();
      extractor.failWith = new Error('stderr: Banque Exemple 150 000,00');
      const { jobId } = await jobs.start('alice', 's', PDF);
      await jobs.idle();
      const view = jobs.get('alice', jobId);
      expect(view.status).toBe('FAILED');
      expect(view.error?.message).toBe(GENERIC_FAILURE_MESSAGE);
      expect(JSON.stringify(view)).not.toMatch(/Banque Exemple|150 000/);
    });

    it('continue la file après un échec', async () => {
      const { jobs, extractor } = setup();
      extractor.failWith = new Error('boum');
      const first = await jobs.start('alice', 's', PDF);
      await jobs.idle();
      extractor.failWith = null;
      const second = await jobs.start('bob', 's', PDF);
      await jobs.idle();
      expect(jobs.get('alice', first.jobId).status).toBe('FAILED');
      expect(jobs.get('bob', second.jobId).status).toBe('DONE');
    });
  });

  describe('une extraction à la fois par utilisateur', () => {
    it('refuse (429) une seconde extraction tant que la première n’est pas terminée', async () => {
      const { jobs, extractor } = setup();
      const { gate, open } = createGate();
      extractor.gate = gate;
      await jobs.start('alice', 's', PDF);
      await expect(jobs.start('alice', 's', PNG)).rejects.toMatchObject({
        status: 429,
      });
      open();
      await jobs.idle();
      await expect(jobs.start('alice', 's', PNG)).resolves.toBeDefined();
    });

    it('accepte une extraction d’un autre utilisateur, mais la met en file (concurrence 1)', async () => {
      const { jobs, extractor } = setup();
      const { gate, open } = createGate();
      extractor.gate = gate;
      const a = await jobs.start('alice', 's', PDF);
      const b = await jobs.start('bob', 's', PDF);
      await new Promise((resolve) => setImmediate(resolve));
      expect(jobs.get('alice', a.jobId).status).toBe('RUNNING');
      expect(jobs.get('bob', b.jobId).status).toBe('PENDING');
      expect(jobs.get('bob', b.jobId).progressPercent).toBe(0);
      expect(extractor.extractCalls).toBe(1);
      open();
      await jobs.idle();
      expect(extractor.extractCalls).toBe(2);
      expect(jobs.get('alice', a.jobId).status).toBe('DONE');
      expect(jobs.get('bob', b.jobId).status).toBe('DONE');
    });

    it('traite la file dans l’ordre d’arrivée', async () => {
      const { jobs, extractor } = setup();
      const order: string[] = [];
      const original = extractor.extract.bind(
        extractor,
      ) as FakeDocumentTextExtractor['extract'];
      extractor.extract = async (file, info, hooks) => {
        order.push(file.toString('latin1', 0, 8));
        return original(file, info, hooks);
      };
      const { gate, open } = createGate();
      extractor.gate = gate;
      await jobs.start('u1', 's', Buffer.from('%PDF-1.1 un'));
      await jobs.start('u2', 's', Buffer.from('%PDF-1.2 deux'));
      await jobs.start('u3', 's', Buffer.from('%PDF-1.3 trois'));
      open();
      await jobs.idle();
      expect(order).toEqual(['%PDF-1.1', '%PDF-1.2', '%PDF-1.3']);
    });
  });

  describe('quota horaire', () => {
    it(`refuse la ${MAX_EXTRACTIONS_PER_HOUR + 1}e extraction en une heure (429) puis rouvre après une heure`, async () => {
      const { jobs, clock } = setup();
      for (let i = 0; i < MAX_EXTRACTIONS_PER_HOUR; i++) {
        const started = await jobs.start('alice', 's', PDF);
        await jobs.idle();
        jobs.delete('alice', started.jobId);
        clock.set(`2026-10-31T10:0${i + 1}:00Z`);
      }
      await expect(jobs.start('alice', 's', PDF)).rejects.toMatchObject({
        status: 429,
        response: { message: expect.stringMatching(/5 extractions par heure/) },
      });
      // Le quota est par utilisateur.
      await expect(jobs.start('bob', 's', PDF)).resolves.toBeDefined();
      await jobs.idle();
      clock.set('2026-10-31T11:00:30Z');
      await expect(jobs.start('alice', 's', PDF)).resolves.toBeDefined();
    });

    it('compte aussi les extractions échouées ou supprimées', async () => {
      const { jobs, extractor, clock } = setup();
      extractor.failWith = new Error('x');
      for (let i = 0; i < MAX_EXTRACTIONS_PER_HOUR; i++) {
        await jobs.start('alice', 's', PDF);
        await jobs.idle();
        clock.set(`2026-10-31T10:0${i + 1}:00Z`);
      }
      await expect(jobs.start('alice', 's', PDF)).rejects.toMatchObject({
        status: 429,
      });
    });
  });

  describe('isolation par utilisateur', () => {
    it('traite l’extraction d’un autre utilisateur comme inexistante (GET et DELETE)', async () => {
      const { jobs } = setup();
      const { jobId } = await jobs.start('alice', 's', PDF);
      await jobs.idle();
      expect(() => jobs.get('bob', jobId)).toThrow(NotFoundException);
      expect(() => jobs.delete('bob', jobId)).toThrow(NotFoundException);
      expect(jobs.get('alice', jobId).status).toBe('DONE');
    });

    it('404 pour un identifiant inconnu', () => {
      const { jobs } = setup();
      expect(() => jobs.get('alice', 'inconnu')).toThrow(NotFoundException);
    });
  });

  describe('suppression et expiration', () => {
    it('DELETE efface le résultat', async () => {
      const { jobs } = setup();
      const { jobId } = await jobs.start('alice', 's', PDF);
      await jobs.idle();
      jobs.delete('alice', jobId);
      expect(() => jobs.get('alice', jobId)).toThrow(NotFoundException);
    });

    it('DELETE d’une extraction en cours l’annule et libère l’utilisateur', async () => {
      const { jobs, extractor } = setup();
      const { gate } = createGate();
      extractor.gate = gate;
      const { jobId } = await jobs.start('alice', 's', PDF);
      await new Promise((resolve) => setImmediate(resolve));
      jobs.delete('alice', jobId);
      await jobs.idle();
      expect(extractor.aborted).toBe(1);
      expect(() => jobs.get('alice', jobId)).toThrow(NotFoundException);
      extractor.gate = null;
      await expect(jobs.start('alice', 's', PDF)).resolves.toBeDefined();
    });

    it('DELETE d’une extraction en file la retire de la file', async () => {
      const { jobs, extractor } = setup();
      const { gate, open } = createGate();
      extractor.gate = gate;
      await jobs.start('alice', 's', PDF);
      const queued = await jobs.start('bob', 's', PDF);
      jobs.delete('bob', queued.jobId);
      open();
      await jobs.idle();
      expect(extractor.extractCalls).toBe(1);
    });

    it('purge le résultat après 15 minutes (horloge injectée)', async () => {
      const { jobs, clock } = setup();
      const { jobId } = await jobs.start('alice', 's', PDF);
      await jobs.idle();
      clock.set('2026-10-31T10:14:59Z');
      expect(jobs.get('alice', jobId).status).toBe('DONE');
      clock.set('2026-10-31T10:15:00Z');
      expect(() => jobs.get('alice', jobId)).toThrow(NotFoundException);
    });

    it('purgeExpired retire aussi une extraction restée en file', async () => {
      const { jobs, extractor, clock } = setup();
      const { gate, open } = createGate();
      extractor.gate = gate;
      await jobs.start('alice', 's', PDF);
      await jobs.start('bob', 's', PDF);
      clock.set('2026-10-31T10:20:00Z');
      jobs.purgeExpired();
      open();
      await jobs.idle();
      expect(extractor.aborted).toBe(1);
      expect(extractor.extractCalls).toBe(1);
    });

    it('le minuteur de purge ne retient pas le processus et s’arrête avec le module', () => {
      const { jobs } = setup();
      const spy = vi.spyOn(global, 'setInterval');
      jobs.onModuleInit();
      const timer = spy.mock.results[0].value as NodeJS.Timeout;
      expect(timer.hasRef()).toBe(false);
      jobs.onModuleDestroy();
      spy.mockRestore();
    });

    it('onModuleDestroy abandonne les extractions en cours', async () => {
      const { jobs, extractor } = setup();
      const { gate } = createGate();
      extractor.gate = gate;
      await jobs.start('alice', 's', PDF);
      await new Promise((resolve) => setImmediate(resolve));
      jobs.onModuleDestroy();
      await jobs.idle();
      expect(extractor.aborted).toBe(1);
    });
  });
});
