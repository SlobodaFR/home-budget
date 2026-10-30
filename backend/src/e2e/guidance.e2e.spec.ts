import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { Clock } from '../domain/shared/clock';
import { FakeClock } from '../testing/fake-clock';

type Agent = ReturnType<typeof request.agent>;

const NBSP = ' ';

describe('Guidance API (tranche 3, end to end, AUTH_MODE=dev, in-memory SQLite)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  const clock = FakeClock.at('2026-11-12T09:30:00Z');
  const env = { ...process.env };

  let alice: Agent;
  let bob: Agent;
  let common: string;
  let alicePersonal: string;
  let bobPersonal: string;

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
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);

    alice = await login('alice');
    bob = await login('bob');
  });

  afterAll(async () => {
    await app.close();
    process.env = env;
  });

  async function login(name: 'alice' | 'bob'): Promise<Agent> {
    const agent = request.agent(app.getHttpServer());
    await agent.get(`/api/auth/dev-login?as=${name}`).expect(302);
    return agent;
  }

  const recurringBody = (over: Record<string, unknown> = {}) => ({
    kind: 'EXPENSE',
    bloc: 'FIXE',
    label: 'Loyer',
    amountCents: 110000,
    dayOfMonth: 5,
    startDate: '2026-01-01',
    endDate: null,
    active: true,
    aidRuleId: null,
    ...over,
  });

  it('refuses household-scoped routes to a user without household, and anonymous callers everywhere', async () => {
    await alice.get('/api/household/safety-net').expect(404);
    await alice.get('/api/household/fiscal-profile').expect(404);
    await alice
      .put('/api/household/safety-net')
      .send({ savedCents: 1, asOf: '2026-11-01', targetMonths: 3 })
      .expect(404);

    const anonymous = request(app.getHttpServer());
    for (const path of [
      '/api/aid-rules',
      '/api/aid-rules/creche-estimate?annualResourcesCents=1&children=1&hoursPerMonth=1',
      '/api/household/safety-net',
      '/api/household/fiscal-profile',
      '/api/spaces/x/recurring',
      '/api/spaces/x/forecast?month=2026-11',
      '/api/spaces/x/insights?month=2026-11',
      '/api/spaces/x/aids',
    ]) {
      await anonymous.get(path).expect(401);
    }
    await anonymous.put('/api/household/safety-net').send({}).expect(401);
    await anonymous.put('/api/household/fiscal-profile').send({}).expect(401);
    await anonymous.post('/api/spaces/x/recurring').send({}).expect(401);
  });

  it('sets up a couple with a common and personal spaces', async () => {
    const created = await alice
      .post('/api/household')
      .send({ name: 'Famille', netMonthlyIncomeCents: 350000 })
      .expect(201);
    const spaces = created.body.spaces as { id: string; kind: string }[];
    common = spaces.find((s) => s.kind === 'COMMON')!.id;
    alicePersonal = spaces.find((s) => s.kind === 'PERSONAL')!.id;
    const { code } = (
      await alice.post('/api/household/invitations').expect(201)
    ).body;
    const joined = await bob
      .post('/api/household/join')
      .send({ code })
      .expect(200);
    bobPersonal = (joined.body.spaces as { id: string; kind: string }[]).find(
      (s) => s.kind === 'PERSONAL',
    )!.id;
  });

  describe('recurring payments', () => {
    it('creates, lists, updates and deletes (contract shapes and status codes)', async () => {
      const created = await alice
        .post(`/api/spaces/${common}/recurring`)
        .send(recurringBody())
        .expect(201);
      expect(created.body).toEqual({
        id: expect.any(String),
        spaceId: common,
        kind: 'EXPENSE',
        bloc: 'FIXE',
        label: 'Loyer',
        amountCents: 110000,
        dayOfMonth: 5,
        startDate: '2026-01-01',
        endDate: null,
        active: true,
        aidRuleId: null,
        accountId: null,
        frequency: 'MONTHLY',
        monthOfYear: null,
      });

      // Champs optionnels absents : dayOfMonth, endDate et aidRuleId valent null.
      const minimal = await bob
        .post(`/api/spaces/${common}/recurring`)
        .send({
          kind: 'INCOME',
          label: 'Salaire',
          amountCents: 300000,
          startDate: '2026-01-01',
          active: true,
        })
        .expect(201);
      expect(minimal.body).toMatchObject({
        kind: 'INCOME',
        bloc: null,
        dayOfMonth: null,
        endDate: null,
        aidRuleId: null,
      });

      const listed = await bob
        .get(`/api/spaces/${common}/recurring`)
        .expect(200);
      expect(listed.body.map((i: { label: string }) => i.label)).toEqual([
        'Loyer',
        'Salaire',
      ]);

      await bob
        .put(`/api/spaces/${common}/recurring/${created.body.id}`)
        .send(recurringBody({ label: 'Loyer + charges', amountCents: 115000 }))
        .expect(204);
      const updated = (
        await alice.get(`/api/spaces/${common}/recurring`).expect(200)
      ).body.find((i: { id: string }) => i.id === created.body.id);
      expect(updated).toMatchObject({
        label: 'Loyer + charges',
        amountCents: 115000,
      });

      await alice
        .delete(`/api/spaces/${common}/recurring/${minimal.body.id}`)
        .expect(204);
      await alice
        .delete(`/api/spaces/${common}/recurring/${minimal.body.id}`)
        .expect(404);
      await alice
        .put(`/api/spaces/${common}/recurring/unknown`)
        .send(recurringBody())
        .expect(404);
      expect(
        (await alice.get(`/api/spaces/${common}/recurring`).expect(200)).body,
      ).toHaveLength(1);
    });

    it('rejects invalid bodies with a 400 and a French message', async () => {
      const bad: [string, Record<string, unknown>][] = [
        ['amount 0', recurringBody({ amountCents: 0 })],
        ['negative amount', recurringBody({ amountCents: -5 })],
        ['fractional amount', recurringBody({ amountCents: 10.5 })],
        ['expense without bloc', recurringBody({ bloc: undefined })],
        ['unknown bloc', recurringBody({ bloc: 'LUXE' })],
        ['income with a bloc', recurringBody({ kind: 'INCOME' })],
        ['unknown kind', recurringBody({ kind: 'TRANSFER' })],
        ['day 0', recurringBody({ dayOfMonth: 0 })],
        ['day 32', recurringBody({ dayOfMonth: 32 })],
        ['end before start', recurringBody({ endDate: '2025-12-31' })],
        ['impossible date', recurringBody({ startDate: '2026-02-30' })],
        ['bad date format', recurringBody({ startDate: '01/01/2026' })],
        ['unknown aid rule', recurringBody({ aidRuleId: 'INCONNUE' })],
        [
          'aid on an income',
          recurringBody({
            kind: 'INCOME',
            bloc: undefined,
            aidRuleId: 'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE',
          }),
        ],
        ['missing active', recurringBody({ active: undefined })],
        ['empty label', recurringBody({ label: '  ' })],
        ['long label', recurringBody({ label: 'x'.repeat(81) })],
      ];
      for (const [name, body] of bad) {
        const response = await alice
          .post(`/api/spaces/${common}/recurring`)
          .send(body);
        expect({ name, status: response.status }).toEqual({
          name,
          status: 400,
        });
      }
      const domain = await alice
        .post(`/api/spaces/${common}/recurring`)
        .send(recurringBody({ endDate: '2025-12-31' }))
        .expect(400);
      expect(domain.body.message).toBe(
        'La date de fin ne peut pas précéder la date de début',
      );
      const dto = await alice
        .post(`/api/spaces/${common}/recurring`)
        .send(recurringBody({ amountCents: 0 }))
        .expect(400);
      expect(JSON.stringify(dto.body.message)).toContain(
        'amountCents doit être strictement positif',
      );
    });

    it('refuses an aid rule on a personal space and accepts it on the common one', async () => {
      const personal = await alice
        .post(`/api/spaces/${alicePersonal}/recurring`)
        .send(
          recurringBody({
            aidRuleId: 'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE',
          }),
        )
        .expect(400);
      expect(personal.body.message).toContain('espace commun');
      const aided = await alice
        .post(`/api/spaces/${common}/recurring`)
        .send(
          recurringBody({
            label: 'Aide-ménagère',
            bloc: 'COURANT',
            amountCents: 10000,
            dayOfMonth: 10,
            aidRuleId: 'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE',
          }),
        )
        .expect(201);
      expect(aided.body.aidRuleId).toBe('CREDIT_IMPOT_SERVICES_A_LA_PERSONNE');
      await alice
        .delete(`/api/spaces/${common}/recurring/${aided.body.id}`)
        .expect(204);
    });

    it('encrypts label and amount of a personal space exactly like operations', async () => {
      const secret = await alice
        .post(`/api/spaces/${alicePersonal}/recurring`)
        .send(
          recurringBody({
            label: 'Psychologue',
            amountCents: 6000,
            bloc: 'COURANT',
          }),
        )
        .expect(201);
      expect(secret.body).toMatchObject({
        label: 'Psychologue',
        amountCents: 6000,
      });
      const raw: Record<string, unknown>[] = await dataSource.query(
        `SELECT * FROM recurring_items WHERE space_id = ?`,
        [alicePersonal],
      );
      expect(raw).toHaveLength(1);
      expect(raw[0].label).toBeNull();
      expect(raw[0].amount_cents).toBeNull();
      expect(String(raw[0].secret_payload).startsWith('v1.')).toBe(true);
      expect(JSON.stringify(raw)).not.toContain('Psychologue');
      // Les métadonnées de planification restent en clair.
      expect(raw[0]).toMatchObject({
        kind: 'EXPENSE',
        bloc: 'COURANT',
        day_of_month: 5,
      });

      const common_: { label: string }[] = await dataSource.query(
        `SELECT label FROM recurring_items WHERE space_id = ?`,
        [common],
      );
      expect(common_[0].label).toBe('Loyer + charges');

      // Une ligne recopiée dans l'espace d'un autre est illisible (AAD lié à la ligne).
      const own = (
        await alice.get(`/api/spaces/${alicePersonal}/recurring`).expect(200)
      ).body;
      expect(own).toHaveLength(1);
      expect(own[0].label).toBe('Psychologue');
    });
  });

  describe('forecast', () => {
    beforeAll(async () => {
      await alice
        .put(`/api/spaces/${common}/plan`)
        .send({
          incomeCents: 380000,
          fixeCents: 175000,
          courantCents: 100000,
          plaisirCents: 45000,
          epargneCents: 20000,
        })
        .expect(204);
      await alice
        .post(`/api/spaces/${common}/recurring`)
        .send(
          recurringBody({
            label: 'Assurance',
            amountCents: 4500,
            dayOfMonth: 8,
          }),
        )
        .expect(201);
      await alice
        .post(`/api/spaces/${common}/recurring`)
        .send(
          recurringBody({
            bloc: 'PLAISIR',
            label: 'Netflix',
            amountCents: 1399,
            dayOfMonth: 15,
          }),
        )
        .expect(201);
      await alice
        .post(`/api/spaces/${common}/recurring`)
        .send({
          kind: 'INCOME',
          label: 'Salaire',
          amountCents: 380000,
          dayOfMonth: 28,
          startDate: '2026-01-01',
          active: true,
        })
        .expect(201);
      await alice
        .post(`/api/spaces/${common}/transactions`)
        .send({
          kind: 'EXPENSE',
          bloc: 'FIXE',
          label: 'PRLV LOYER + CHARGES NOVEMBRE',
          amountCents: 110000,
          date: '2026-11-05T00:00:00.000Z',
        })
        .expect(201);
    });

    it('answers with the contract shape for the current month', async () => {
      const response = await bob
        .get(`/api/spaces/${common}/forecast?month=2026-11`)
        .expect(200);
      expect(response.body).toEqual({
        month: '2026-11',
        asOf: '2026-11-12T00:00:00.000Z',
        income: {
          plannedCents: 380000,
          actualCents: 0,
          expectedRemainingCents: 380000,
          projectedCents: 380000,
          contributionAssumed: false,
        },
        blocs: [
          {
            bloc: 'FIXE',
            plannedCents: 175000,
            actualCents: 110000,
            expectedRemainingCents: 4500,
            projectedCents: 114500,
          },
          {
            bloc: 'COURANT',
            plannedCents: 100000,
            actualCents: 0,
            expectedRemainingCents: 0,
            projectedCents: 0,
          },
          {
            bloc: 'PLAISIR',
            plannedCents: 45000,
            actualCents: 0,
            expectedRemainingCents: 1399,
            projectedCents: 1399,
          },
          {
            bloc: 'EPARGNE',
            plannedCents: 20000,
            actualCents: 0,
            expectedRemainingCents: 0,
            projectedCents: 0,
          },
        ],
        projectedBalanceCents: 264101,
        cautiousBalanceCents: 40000,
        occurrences: [
          {
            recurringId: expect.any(String),
            label: 'Loyer + charges',
            kind: 'EXPENSE',
            bloc: 'FIXE',
            amountCents: 115000,
            date: '2026-11-05T00:00:00.000Z',
            estimated: false,
            status: 'PAID',
          },
          expect.objectContaining({
            label: 'Assurance',
            date: '2026-11-08T00:00:00.000Z',
            status: 'MISSING',
          }),
          expect.objectContaining({ label: 'Netflix', status: 'DUE' }),
          expect.objectContaining({
            label: 'Salaire',
            kind: 'INCOME',
            bloc: null,
            status: 'DUE',
          }),
        ],
      });
    });

    it('projects a past month as the actuals and a future month from the recurring items', async () => {
      clock.set('2026-12-03T09:00:00Z');
      try {
        const past = (
          await alice
            .get(`/api/spaces/${common}/forecast?month=2026-11`)
            .expect(200)
        ).body;
        expect(past.projectedBalanceCents).toBe(-110000);
        expect(past.cautiousBalanceCents).toBe(-110000);
        expect(
          past.occurrences.map((o: { status: string }) => o.status),
        ).toEqual(['PAID', 'MISSING', 'MISSING', 'MISSING']);

        const future = (
          await alice
            .get(`/api/spaces/${common}/forecast?month=2027-03`)
            .expect(200)
        ).body;
        expect(
          new Set(future.occurrences.map((o: { status: string }) => o.status)),
        ).toEqual(new Set(['DUE']));
        expect(future.blocs).toHaveLength(4);
        expect(future.cautiousBalanceCents).toBe(
          380000 - (175000 + 100000 + 45000 + 20000),
        );
      } finally {
        clock.set('2026-11-12T09:30:00Z');
      }
    });

    it('validates the month and hides personal spaces', async () => {
      await alice.get(`/api/spaces/${common}/forecast`).expect(400);
      await alice
        .get(`/api/spaces/${common}/forecast?month=2026-13`)
        .expect(400);
      await alice.get(`/api/spaces/nope/forecast?month=2026-11`).expect(404);
      await alice
        .get(`/api/spaces/${alicePersonal}/forecast?month=2026-11`)
        .expect(200);
      await bob
        .get(`/api/spaces/${alicePersonal}/forecast?month=2026-11`)
        .expect(404);
    });
  });

  describe('safety net', () => {
    it('is shared by the household and validated', async () => {
      expect(
        (await alice.get('/api/household/safety-net').expect(200)).body,
      ).toEqual({ safetyNet: null, progress: null });
      await bob
        .put('/api/household/safety-net')
        .send({ savedCents: 550000, asOf: '2026-11-01', targetMonths: 6 })
        .expect(204);
      // Sans épargne postérieure : base = Fixe + Courant du plan commun (275 000).
      expect(
        (await alice.get('/api/household/safety-net').expect(200)).body,
      ).toEqual({
        safetyNet: { savedCents: 550000, asOf: '2026-11-01', targetMonths: 6 },
        progress: {
          currentCents: 550000,
          monthlyBasisCents: 275000,
          coveredMonths: 2,
        },
      });

      // Une épargne postérieure à asOf s'ajoute à `progress`, jamais à savedCents.
      await alice
        .post(`/api/spaces/${common}/transactions`)
        .send({
          kind: 'EXPENSE',
          bloc: 'EPARGNE',
          label: 'Virement livret',
          amountCents: 50000,
          date: '2026-11-10T00:00:00.000Z',
        })
        .expect(201);
      await alice
        .post(`/api/spaces/${common}/transactions`)
        .send({
          kind: 'EXPENSE',
          bloc: 'EPARGNE',
          label: 'Avant la date',
          amountCents: 99999,
          date: '2026-10-20T00:00:00.000Z',
        })
        .expect(201);
      expect(
        (await bob.get('/api/household/safety-net').expect(200)).body,
      ).toEqual({
        safetyNet: { savedCents: 550000, asOf: '2026-11-01', targetMonths: 6 },
        progress: {
          currentCents: 600000,
          monthlyBasisCents: 275000,
          coveredMonths: 2.2,
        },
      });

      for (const body of [
        { savedCents: -1, asOf: '2026-11-01', targetMonths: 6 },
        { savedCents: 1.5, asOf: '2026-11-01', targetMonths: 6 },
        { savedCents: 100, asOf: '2026-11-31', targetMonths: 6 },
        { savedCents: 100, asOf: '01/11/2026', targetMonths: 6 },
        { savedCents: 100, asOf: '2026-11-01', targetMonths: 0 },
        { savedCents: 100, asOf: '2026-11-01', targetMonths: 25 },
        { savedCents: 100, asOf: '2026-11-01', targetMonths: 2.5 },
        { asOf: '2026-11-01', targetMonths: 6 },
      ]) {
        await alice.put('/api/household/safety-net').send(body).expect(400);
      }
      await alice
        .put('/api/household/safety-net')
        .send({ savedCents: 0, asOf: '2026-11-01', targetMonths: 24 })
        .expect(204);
      await alice
        .put('/api/household/safety-net')
        .send({ savedCents: 550000, asOf: '2026-11-01', targetMonths: 6 })
        .expect(204);
    });
  });

  describe('insights', () => {
    it('lists ordered insights with stable ids for the common space', async () => {
      const response = await bob
        .get(`/api/spaces/${common}/insights?month=2026-11`)
        .expect(200);
      const insights = response.body.insights as {
        id: string;
        severity: string;
        title: string;
        detail: string;
        lesson: number | null;
        link: string | null;
      }[];
      expect(insights.length).toBeLessThanOrEqual(8);
      const ids = insights.map((i) => i.id);
      expect(ids).toEqual(
        expect.arrayContaining(['recurring-missing', 'safety-net-progress']),
      );
      const missing = insights.find((i) => i.id === 'recurring-missing')!;
      expect(missing).toEqual({
        id: 'recurring-missing',
        severity: 'ACTION',
        title: '1 paiement récurrent introuvable',
        detail:
          'Assurance (8 nov.) est attendu mais absent des opérations. Importez votre relevé.',
        lesson: 4,
        link: '/import',
      });
      // (550 000 + 50 000) / (175 000 + 100 000) = 2,2 mois couverts sur 6.
      expect(insights.find((i) => i.id === 'safety-net-progress')!.title).toBe(
        'Épargne de sécurité : 2,2 mois sur 6',
      );
      const rank: Record<string, number> = {
        WARNING: 0,
        ACTION: 1,
        INFO: 2,
        GOOD: 3,
      };
      const ranks = insights.map((i) => rank[i.severity]);
      expect([...ranks].sort()).toEqual(ranks);
      expect(
        insights.find((i) => i.id === 'upcoming-payments')!.detail,
      ).toContain(`Netflix (15 nov., 13,99${NBSP}€)`);
    });

    it('keeps common-only insights out of the personal space', async () => {
      const mine = (
        await alice
          .get(`/api/spaces/${alicePersonal}/insights?month=2026-11`)
          .expect(200)
      ).body.insights as { id: string }[];
      expect(
        mine.filter(
          (i) =>
            i.id.startsWith('safety-net') || i.id === 'contribution-incomplete',
        ),
      ).toEqual([]);
      const common_ = (
        await alice
          .get(`/api/spaces/${common}/insights?month=2026-11`)
          .expect(200)
      ).body.insights as { id: string }[];
      // Le revenu de Bob n'est pas renseigné.
      expect(common_.map((i) => i.id)).toContain('contribution-incomplete');
    });

    it('validates the month and the access', async () => {
      await alice.get(`/api/spaces/${common}/insights`).expect(400);
      await alice.get(`/api/spaces/${common}/insights?month=nope`).expect(400);
      await bob
        .get(`/api/spaces/${alicePersonal}/insights?month=2026-11`)
        .expect(404);
    });
  });

  describe('aids', () => {
    let cleaningId: string;
    let crecheId: string;

    it('serves the catalogue to any authenticated user', async () => {
      const response = await bob.get('/api/aid-rules').expect(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toEqual({
        id: 'CREDIT_IMPOT_GARDE_HORS_DOMICILE',
        label: "Garde d'enfants de moins de 6 ans hors du domicile",
        description: expect.stringContaining('Crèche'),
        ratePercent: 50,
        capDescription:
          '3 500 € de frais par enfant de moins de 6 ans (soit 1 750 € de crédit au maximum)',
        cashTiming: expect.stringContaining('2042 RICI'),
        sourceLabel: 'impots.gouv.fr',
        sourceUrl:
          'https://www.impots.gouv.fr/particulier/questions/je-fais-garder-mon-jeune-enfant-lexterieur-du-domicile-que-puis-je-deduire',
        verifiedOn: '2026-10-30',
      });
      expect(response.body[1].id).toBe('CREDIT_IMPOT_SERVICES_A_LA_PERSONNE');
      expect(response.body[1].description).toContain('20 000');
    });

    it('stores a shared fiscal profile and validates it', async () => {
      expect(
        (await alice.get('/api/household/fiscal-profile').expect(200)).body,
      ).toEqual({ fiscalProfile: null });
      for (const body of [
        {
          childrenUnderSix: 11,
          dependentChildren: 0,
          firstYearHomeServices: false,
        },
        {
          childrenUnderSix: -1,
          dependentChildren: 0,
          firstYearHomeServices: false,
        },
        {
          childrenUnderSix: 1.5,
          dependentChildren: 0,
          firstYearHomeServices: false,
        },
        { childrenUnderSix: 1, dependentChildren: 0 },
        {
          childrenUnderSix: 1,
          dependentChildren: 0,
          firstYearHomeServices: 'oui',
        },
      ]) {
        await alice.put('/api/household/fiscal-profile').send(body).expect(400);
      }
    });

    it('computes expected credits, with a missing profile first', async () => {
      cleaningId = (
        await alice
          .post(`/api/spaces/${common}/recurring`)
          .send(
            recurringBody({
              label: 'Femme de ménage',
              bloc: 'COURANT',
              amountCents: 10000,
              dayOfMonth: 10,
              aidRuleId: 'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE',
            }),
          )
          .expect(201)
      ).body.id;
      crecheId = (
        await alice
          .post(`/api/spaces/${common}/recurring`)
          .send(
            recurringBody({
              label: 'Crèche',
              amountCents: 40000,
              dayOfMonth: 3,
              aidRuleId: 'CREDIT_IMPOT_GARDE_HORS_DOMICILE',
            }),
          )
          .expect(201)
      ).body.id;

      const noProfile = (
        await alice.get(`/api/spaces/${common}/aids?year=2026`).expect(200)
      ).body;
      expect(noProfile.profileMissing).toBe(true);
      const garde0 = noProfile.rules.find(
        (r: { ruleId: string }) =>
          r.ruleId === 'CREDIT_IMPOT_GARDE_HORS_DOMICILE',
      );
      expect(garde0).toMatchObject({ capCents: 0, expectedCreditCents: 0 });

      await bob
        .put('/api/household/fiscal-profile')
        .send({
          childrenUnderSix: 1,
          dependentChildren: 3,
          firstYearHomeServices: false,
        })
        .expect(204);
      expect(
        (await alice.get('/api/household/fiscal-profile').expect(200)).body,
      ).toEqual({
        fiscalProfile: {
          childrenUnderSix: 1,
          dependentChildren: 3,
          firstYearHomeServices: false,
        },
      });

      const aids = (
        await alice.get(`/api/spaces/${common}/aids?year=2026`).expect(200)
      ).body;
      expect(aids.year).toBe(2026);
      expect(aids.profileMissing).toBe(false);
      expect(aids.rules.map((r: { ruleId: string }) => r.ruleId)).toEqual([
        'CREDIT_IMPOT_GARDE_HORS_DOMICILE',
        'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE',
      ]);
      const [garde, services] = aids.rules;
      expect(garde).toEqual({
        ruleId: 'CREDIT_IMPOT_GARDE_HORS_DOMICILE',
        label: "Garde d'enfants de moins de 6 ans hors du domicile",
        ratePercent: 50,
        spentCents: 480000,
        capCents: 350000,
        eligibleCents: 350000,
        expectedCreditCents: 175000,
        capReached: true,
        cashTiming: expect.stringContaining('2042 RICI'),
        sourceUrl: expect.stringContaining('impots.gouv.fr'),
        verifiedOn: '2026-10-30',
        lines: [
          {
            recurringId: crecheId,
            label: 'Crèche',
            yearlySpentCents: 480000,
            monthlyCents: 40000,
            netMonthlyCents: 25417,
          },
        ],
      });
      expect(services).toMatchObject({
        spentCents: 120000,
        capCents: 1_500_000,
        eligibleCents: 120000,
        expectedCreditCents: 60000,
        capReached: false,
      });
      expect(services.lines).toEqual([
        {
          recurringId: cleaningId,
          label: 'Femme de ménage',
          yearlySpentCents: 120000,
          monthlyCents: 10000,
          netMonthlyCents: 5000,
        },
      ]);
      expect(aids.totalExpectedCreditCents).toBe(235000);
    });

    it('defaults to the current year and validates the year', async () => {
      expect(
        (await alice.get(`/api/spaces/${common}/aids`).expect(200)).body.year,
      ).toBe(2026);
      await alice.get(`/api/spaces/${common}/aids?year=abc`).expect(400);
      await alice.get(`/api/spaces/${common}/aids?year=1800`).expect(400);
    });

    it('is reserved to the common space (404 even for the owner of a personal space)', async () => {
      await alice.get(`/api/spaces/${alicePersonal}/aids`).expect(404);
      await bob.get(`/api/spaces/${alicePersonal}/aids`).expect(404);
      await bob.get(`/api/spaces/${bobPersonal}/aids`).expect(404);
    });
  });

  describe('creche estimator', () => {
    const url = (params: Record<string, string | number>) =>
      `/api/aid-rules/creche-estimate?${new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)]),
      ).toString()}`;

    it('answers with the contract example', async () => {
      const response = await alice
        .get(
          url({
            annualResourcesCents: 6_240_000,
            children: 4,
            hoursPerMonth: 160,
            kind: 'COLLECTIVE',
          }),
        )
        .expect(200);
      expect(response.body).toEqual({
        kind: 'COLLECTIVE',
        effortRatePercent: 0.031,
        monthlyResourcesUsedCents: 520000,
        hourlyRateCents: 161,
        monthlyBillCents: 25760,
        floorCents: 81462,
        ceilingCents: 850000,
        ceilingApplied: false,
        floorApplied: false,
        verifiedOn: '2026-10-30',
        sourceUrl:
          'https://www.caf.fr/sites/default/files/medias/493/Partenaires/Petite-enfance/EAJE/Guide_PSU_2026_02_V_Def.pdf',
      });
    });

    it('applies the floor and the ceiling and defaults the kind', async () => {
      const high = (
        await alice
          .get(
            url({
              annualResourcesCents: 12_000_000,
              children: 1,
              hoursPerMonth: 100,
            }),
          )
          .expect(200)
      ).body;
      expect(high).toMatchObject({
        kind: 'COLLECTIVE',
        ceilingApplied: true,
        monthlyResourcesUsedCents: 850000,
        hourlyRateCents: 526,
        monthlyBillCents: 52600,
      });
      const low = (
        await alice
          .get(
            url({
              annualResourcesCents: 600_000,
              children: 1,
              hoursPerMonth: 100,
            }),
          )
          .expect(200)
      ).body;
      expect(low).toMatchObject({
        floorApplied: true,
        monthlyResourcesUsedCents: 81462,
        hourlyRateCents: 50,
      });
    });

    it('answers 400 for invalid or missing parameters', async () => {
      const ok = {
        annualResourcesCents: 3_600_000,
        children: 2,
        hoursPerMonth: 100,
      };
      await alice.get(url(ok)).expect(200);
      for (const bad of [
        { ...ok, children: 0 },
        { ...ok, children: 1.5 },
        { ...ok, children: 'abc' },
        { ...ok, annualResourcesCents: -1 },
        { ...ok, annualResourcesCents: 'abc' },
        { ...ok, hoursPerMonth: 401 },
        { ...ok, hoursPerMonth: -1 },
        { ...ok, kind: 'FAMILIALE' },
      ]) {
        await alice.get(url(bad)).expect(400);
      }
      await alice.get('/api/aid-rules/creche-estimate').expect(400);
      await alice
        .get(url({ annualResourcesCents: 100, children: 1 }))
        .expect(400);
      await alice.get(url({ ...ok, hoursPerMonth: 400 })).expect(200);
      await alice.get(url({ ...ok, hoursPerMonth: 0 })).expect(200);
    });
  });

  describe('isolation of personal spaces', () => {
    it('gives the other member a 404 on every new route', async () => {
      const mine = (
        await alice.get(`/api/spaces/${alicePersonal}/recurring`).expect(200)
      ).body[0];
      const id = alicePersonal;
      await bob.get(`/api/spaces/${id}/recurring`).expect(404);
      await bob
        .post(`/api/spaces/${id}/recurring`)
        .send(recurringBody({ label: 'Intrusion' }))
        .expect(404);
      await bob
        .put(`/api/spaces/${id}/recurring/${mine.id}`)
        .send(recurringBody({ label: 'Intrusion' }))
        .expect(404);
      await bob.delete(`/api/spaces/${id}/recurring/${mine.id}`).expect(404);
      await bob.get(`/api/spaces/${id}/forecast?month=2026-11`).expect(404);
      await bob.get(`/api/spaces/${id}/insights?month=2026-11`).expect(404);
      await bob.get(`/api/spaces/${id}/aids?year=2026`).expect(404);

      // Passer par l'espace commun ne contourne rien : la ligne n'appartient pas à cet espace.
      await bob
        .put(`/api/spaces/${common}/recurring/${mine.id}`)
        .send(recurringBody({ label: 'Intrusion' }))
        .expect(404);
      await bob
        .delete(`/api/spaces/${common}/recurring/${mine.id}`)
        .expect(404);

      // Rien n'a bougé pour Alice.
      const after = (
        await alice.get(`/api/spaces/${alicePersonal}/recurring`).expect(200)
      ).body;
      expect(after).toHaveLength(1);
      expect(after[0].label).toBe('Psychologue');
    });

    it('does not leak personal recurring items into the common space', async () => {
      const labels = (
        await bob.get(`/api/spaces/${common}/recurring`).expect(200)
      ).body.map((i: { label: string }) => i.label);
      expect(labels).not.toContain('Psychologue');
      const forecast = (
        await bob
          .get(`/api/spaces/${common}/forecast?month=2026-11`)
          .expect(200)
      ).body;
      expect(JSON.stringify(forecast)).not.toContain('Psychologue');
    });
  });
});
