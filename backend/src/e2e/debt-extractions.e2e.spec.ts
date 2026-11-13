import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import {
  DocumentExtractionError,
  DocumentTextExtractor,
} from '../domain/contract-extraction/document-text-extractor';
import { Clock } from '../domain/shared/clock';
import { DebtExtractionJobs } from '../application/debt-extraction/debt-extraction.jobs';
import { IMMO_CLEAN } from '../testing/contract-fixtures';
import { FakeClock } from '../testing/fake-clock';
import {
  FakeDocumentTextExtractor,
  createGate,
} from '../testing/fake-document-text-extractor';

type Agent = ReturnType<typeof request.agent>;

const PDF = Buffer.from('%PDF-1.4\nMOTSECRET contrat fictif\n%%EOF\n');
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64),
]);
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(64),
]);

describe('Import de contrat par OCR (tranche 13, end to end, AUTH_MODE=dev, extracteur factice)', () => {
  let app: NestExpressApplication;
  let jobs: DebtExtractionJobs;
  const extractor = new FakeDocumentTextExtractor();
  const clock = FakeClock.at('2026-10-31T09:30:00Z');
  /** Début du test courant : chaque test avance de 2 h pour repartir d'un quota vide. */
  let t0 = new Date('2026-10-31T09:30:00Z').getTime();
  const atMinutes = (minutes: number) =>
    clock.set(new Date(t0 + minutes * 60_000).toISOString());
  const env = { ...process.env };

  let alice: Agent;
  let bob: Agent;
  let common: string;
  let alicePersonal: string;

  beforeAll(async () => {
    Object.assign(process.env, {
      AUTH_MODE: 'dev',
      NODE_ENV: 'test',
      DATABASE_PATH: ':memory:',
      FRONTEND_URL: 'http://localhost:3000',
    });
    delete process.env.PERSONAL_DATA_KEY;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(clock)
      .overrideProvider(DocumentTextExtractor)
      .useValue(extractor)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    jobs = app.get(DebtExtractionJobs);

    alice = request
      .agent(app.getHttpServer())
      .set('Sec-Fetch-Site', 'same-origin');
    await alice.get('/api/auth/dev-login?as=alice').expect(302);
    bob = request
      .agent(app.getHttpServer())
      .set('Sec-Fetch-Site', 'same-origin');
    await bob.get('/api/auth/dev-login?as=bob').expect(302);
    const created = await alice
      .post('/api/household')
      .send({ name: 'Famille', netMonthlyIncomeCents: 300000 })
      .expect(201);
    const spaces = created.body.spaces as { id: string; kind: string }[];
    common = spaces.find((s) => s.kind === 'COMMON')!.id;
    alicePersonal = spaces.find((s) => s.kind === 'PERSONAL')!.id;
    const { code } = (
      await alice.post('/api/household/invitations').expect(201)
    ).body;
    await bob.post('/api/household/join').send({ code }).expect(200);
  });

  afterAll(async () => {
    await app.close();
    process.env = env;
  });

  beforeEach(async () => {
    // Chaque test part d'un état propre : plus d'extraction, quota vide, horloge au départ.
    await jobs.idle();
    extractor.gate = null;
    extractor.failWith = null;
    extractor.available = true;
    extractor.rejectPdf = null;
    extractor.pages = [IMMO_CLEAN];
    extractor.source = 'TEXT_LAYER';
    t0 += 2 * 60 * 60_000;
    atMinutes(0);
    jobs.onModuleDestroy();
  });

  const url = (space = common) => `/api/spaces/${space}/debts/extract`;
  const upload = (
    agent: Agent,
    buffer: Buffer = PDF,
    options: {
      space?: string;
      field?: string;
      filename?: string;
      type?: string;
    } = {},
  ) =>
    agent.post(url(options.space)).attach(options.field ?? 'file', buffer, {
      filename: options.filename ?? 'secret-contrat-dupont.pdf',
      contentType: options.type ?? 'application/pdf',
    });
  const poll = async (agent: Agent, jobId: string) => {
    for (let i = 0; i < 50; i++) {
      const res = await agent.get(`/api/debt-extractions/${jobId}`).expect(200);
      if (res.body.status === 'DONE' || res.body.status === 'FAILED') {
        return res.body as {
          status: string;
          result?: any;
          error?: any;
          [key: string]: any;
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('extraction non terminée');
  };

  it('exige une authentification sur toutes les routes', async () => {
    // Agent neuf, sans cookie : anonyme, mais depuis le front (meme origine) pour tester l'authentification.
    const anonymous = request
      .agent(app.getHttpServer())
      .set('Sec-Fetch-Site', 'same-origin');
    await anonymous.get('/api/debt-extractions/capabilities').expect(401);
    await anonymous.get('/api/debt-extractions/x').expect(401);
    await anonymous.delete('/api/debt-extractions/x').expect(401);
    await anonymous
      .post(url())
      .attach('file', PDF, {
        filename: 'a.pdf',
        contentType: 'application/pdf',
      })
      .expect(401);
  });

  describe('GET /api/debt-extractions/capabilities', () => {
    it('annonce les moteurs et les limites', async () => {
      const res = await alice
        .get('/api/debt-extractions/capabilities')
        .expect(200);
      expect(res.body).toEqual({
        available: true,
        engines: ['tesseract'],
        maxFileBytes: 10485760,
        maxPages: 40,
      });
    });

    it('available vaut false quand les outils sont absents', async () => {
      extractor.available = false;
      const res = await alice
        .get('/api/debt-extractions/capabilities')
        .expect(200);
      expect(res.body).toMatchObject({ available: false, engines: [] });
    });
  });

  describe('POST /api/spaces/:spaceId/debts/extract', () => {
    it('202 puis résultat DONE avec les champs proposés (PDF)', async () => {
      const res = await upload(alice).expect(202);
      expect(res.body.jobId).toEqual(expect.any(String));
      expect(new Date(res.body.expiresAt).getTime()).toBe(
        clock.now().getTime() + 15 * 60 * 1000,
      );
      const done = await poll(alice, res.body.jobId);
      expect(done).toMatchObject({
        status: 'DONE',
        stage: null,
        progressPercent: 100,
        result: { source: 'TEXT_LAYER', pages: 1, engine: null },
      });
      expect(done.error).toBeUndefined();
      const byField = Object.fromEntries(
        (done.result.fields as { field: string; value: unknown }[]).map((f) => [
          f.field,
          f.value,
        ]),
      );
      expect(byField).toMatchObject({
        lender: 'Banque Exemple',
        principalCents: 15000000,
        annualRatePercent: 3.45,
        initialTermMonths: 240,
        monthlyPaymentCents: 86233,
        rateType: 'FIXED',
        insuranceMonthlyCents: 3500,
        feesCents: 90000,
        guaranteeKind: 'SURETY',
        guaranteeCents: 150000,
        startDate: '2024-04-05',
        contractReference: 'PI-2024-004517',
      });
      expect(done.result.fields[0]).toEqual(
        expect.objectContaining({
          confidence: expect.stringMatching(/HIGH|MEDIUM|LOW/),
          snippet: expect.any(String),
          page: 1,
        }),
      );
      expect(done.result.warnings).toEqual([]);
    });

    it('accepte une image PNG ou JPEG et annonce le moteur d’OCR', async () => {
      extractor.source = 'OCR';
      for (const [buffer, type, name] of [
        [PNG, 'image/png', 'scan.png'],
        [JPEG, 'image/jpeg', 'photo.jpg'],
      ] as const) {
        const res = await upload(alice, buffer, {
          type,
          filename: name,
        }).expect(202);
        const done = await poll(alice, res.body.jobId);
        expect(done.result).toMatchObject({
          source: 'OCR',
          engine: 'tesseract',
        });
        await alice
          .delete(`/api/debt-extractions/${res.body.jobId}`)
          .expect(204);
        jobs.onModuleDestroy();
      }
    });

    it('traite un fichier de plusieurs Mo (la limite JSON de 1 Mo ne s’applique pas au multipart)', async () => {
      const big = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024, 7)]);
      const res = await upload(alice, big, {
        type: 'image/png',
        filename: 'gros.png',
      }).expect(202);
      expect((await poll(alice, res.body.jobId)).status).toBe('DONE');
    });

    it('vérifie le type sur les octets, pas sur l’extension ni le type annoncé', async () => {
      const res = await upload(
        alice,
        Buffer.from('MZ\x90\x00 exécutable déguisé'),
        {
          filename: 'contrat.pdf',
          type: 'application/pdf',
        },
      ).expect(400);
      expect(res.body.message).toMatch(/Format non pris en charge/);
      // Un vrai PDF envoyé avec une mauvaise extension reste accepté.
      await upload(alice, PDF, {
        filename: 'contrat.txt',
        type: 'text/plain',
      }).expect(202);
    });

    it('400 : fichier absent, mauvais champ, corps JSON', async () => {
      const none = await alice.post(url()).field('note', 'rien').expect(400);
      expect(none.body.message).toMatch(/Aucun fichier/);
      await upload(alice, PDF, { field: 'document' }).expect(400);
      await alice.post(url()).send({ file: 'x' }).expect(400);
    });

    it('400 : fichier de plus de 10 Mo, message en français', async () => {
      const huge = Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024, 1)]);
      const res = await upload(alice, huge, { type: 'image/png' }).expect(400);
      expect(res.body.message).toMatch(/10 Mo/);
    });

    it('400 : PDF protégé ou illisible (message de l’extracteur)', async () => {
      extractor.rejectPdf =
        'Ce PDF est protégé par un mot de passe : retirez la protection puis réessayez.';
      const res = await upload(alice).expect(400);
      expect(res.body.message).toMatch(/protégé par un mot de passe/);
    });

    it('400 : corps multipart mal formé', async () => {
      const res = await alice
        .post(url())
        .set('Content-Type', 'multipart/form-data; boundary=xyz')
        .send('pas du multipart')
        .expect(400);
      expect(res.body.message).toEqual(expect.any(String));
    });

    it('404 : espace inconnu, ou espace personnel d’un autre membre', async () => {
      await upload(alice, PDF, { space: 'inconnu' }).expect(404);
      await upload(bob, PDF, { space: alicePersonal }).expect(404);
      await upload(alice, PDF, { space: alicePersonal }).expect(202);
    });

    it('503 OCR_UNAVAILABLE quand les outils sont absents', async () => {
      extractor.available = false;
      const res = await upload(alice).expect(503);
      expect(res.body).toMatchObject({ code: 'OCR_UNAVAILABLE' });
    });

    it('429 tant qu’une extraction du même utilisateur est en cours, puis OK', async () => {
      const { gate, open } = createGate();
      extractor.gate = gate;
      const first = await upload(alice).expect(202);
      const second = await upload(alice).expect(429);
      expect(second.body.message).toMatch(/déjà en cours/);
      // Un autre utilisateur n'est pas bloqué : son extraction attend son tour.
      const other = await upload(bob).expect(202);
      const queued = await bob
        .get(`/api/debt-extractions/${other.body.jobId}`)
        .expect(200);
      expect(queued.body).toMatchObject({
        status: 'PENDING',
        stage: null,
        progressPercent: 0,
      });
      const running = await alice
        .get(`/api/debt-extractions/${first.body.jobId}`)
        .expect(200);
      expect(running.body.status).toBe('RUNNING');
      open();
      expect((await poll(alice, first.body.jobId)).status).toBe('DONE');
      expect((await poll(bob, other.body.jobId)).status).toBe('DONE');
      await upload(alice).expect(202);
    });

    it('429 au-delà de 5 extractions par heure, puis OK une heure plus tard', async () => {
      for (let i = 0; i < 5; i++) {
        const res = await upload(bob).expect(202);
        await poll(bob, res.body.jobId);
        atMinutes(i + 1);
      }
      const limited = await upload(bob).expect(429);
      expect(limited.body.message).toMatch(/5 extractions par heure/);
      atMinutes(61);
      await upload(bob).expect(202);
    });
  });

  describe('GET / DELETE /api/debt-extractions/:jobId', () => {
    it('404 pour un autre utilisateur (GET et DELETE) ou un identifiant inconnu', async () => {
      const { body } = await upload(alice).expect(202);
      await poll(alice, body.jobId);
      await bob.get(`/api/debt-extractions/${body.jobId}`).expect(404);
      await bob.delete(`/api/debt-extractions/${body.jobId}`).expect(404);
      await alice.get('/api/debt-extractions/inconnu').expect(404);
      await alice.get(`/api/debt-extractions/${body.jobId}`).expect(200);
    });

    it('DELETE efface le résultat (204) puis 404', async () => {
      const { body } = await upload(alice).expect(202);
      await poll(alice, body.jobId);
      await alice.delete(`/api/debt-extractions/${body.jobId}`).expect(204);
      await alice.get(`/api/debt-extractions/${body.jobId}`).expect(404);
      await alice.delete(`/api/debt-extractions/${body.jobId}`).expect(404);
    });

    it('le résultat disparaît après 15 minutes', async () => {
      const { body } = await upload(alice).expect(202);
      await poll(alice, body.jobId);
      atMinutes(14.98);
      await alice.get(`/api/debt-extractions/${body.jobId}`).expect(200);
      atMinutes(15.02);
      await alice.get(`/api/debt-extractions/${body.jobId}`).expect(404);
    });

    it('FAILED : message français, sans extrait du document', async () => {
      extractor.failWith = new Error(
        'stderr contenant MOTSECRET et Banque Exemple',
      );
      const { body } = await upload(alice).expect(202);
      const failed = await poll(alice, body.jobId);
      expect(failed.status).toBe('FAILED');
      expect(failed.result).toBeUndefined();
      expect(failed.error.message).toMatch(/L'extraction a échoué/);
      expect(JSON.stringify(failed)).not.toMatch(/MOTSECRET|Banque Exemple/);
    });

    it('FAILED : message d’une erreur de lecture connue', async () => {
      extractor.failWith = new DocumentExtractionError(
        'Le traitement du document a pris trop de temps.',
      );
      const { body } = await upload(alice).expect(202);
      const failed = await poll(alice, body.jobId);
      expect(failed.error).toEqual({
        message: 'Le traitement du document a pris trop de temps.',
      });
    });
  });

  describe('confidentialité', () => {
    it('n’écrit dans les journaux ni le contenu, ni le nom du fichier, ni le résultat', async () => {
      const calls: string[] = [];
      const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map(
        (level) =>
          jest
            .spyOn(Logger.prototype, level)
            .mockImplementation((...args: unknown[]) => {
              calls.push(JSON.stringify(args));
            }),
      );
      try {
        extractor.pages = [`MOTSECRET\n${IMMO_CLEAN}`];
        const ok = await upload(alice).expect(202);
        await poll(alice, ok.body.jobId);
        await alice
          .delete(`/api/debt-extractions/${ok.body.jobId}`)
          .expect(204);
        extractor.failWith = new Error('MOTSECRET dans un message d’outil');
        const ko = await upload(alice).expect(202);
        await poll(alice, ko.body.jobId);
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }
      const journal = calls.join('\n');
      expect(journal).toMatch(/job=/);
      expect(journal).not.toMatch(
        /MOTSECRET|secret-contrat|dupont|Banque Exemple|150 000|PI-2024/i,
      );
    });
  });
});
