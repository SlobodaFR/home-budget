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

describe('Non-monthly payments and provisions API (tranche 5, end to end)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  const clock = FakeClock.at('2026-10-30T09:30:00Z');
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
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);

    alice = request.agent(app.getHttpServer());
    await alice.get('/api/auth/dev-login?as=alice').expect(302);
    bob = request.agent(app.getHttpServer());
    await bob.get('/api/auth/dev-login?as=bob').expect(302);
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
    await bob.post('/api/household/join').send({ code }).expect(200);
  });

  afterAll(async () => {
    await app.close();
    process.env = env;
  });

  const body = (over: Record<string, unknown> = {}) => ({
    kind: 'EXPENSE',
    bloc: 'FIXE',
    label: 'Loyer',
    amountCents: 110000,
    dayOfMonth: 5,
    startDate: '2026-01-01',
    endDate: null,
    active: true,
    ...over,
  });
  const taxe = (over: Record<string, unknown> = {}) =>
    body({
      label: 'Taxe foncière',
      amountCents: 120000,
      dayOfMonth: 15,
      frequency: 'YEARLY',
      monthOfYear: 10,
      ...over,
    });

  let taxeId: string;
  let assuranceId: string;

  describe('periodicity on recurring items', () => {
    it('defaults to MONTHLY and exposes frequency and monthOfYear', async () => {
      const monthly = await alice
        .post(`/api/spaces/${common}/recurring`)
        .send(body())
        .expect(201);
      expect(monthly.body).toMatchObject({
        frequency: 'MONTHLY',
        monthOfYear: null,
      });
      await alice
        .post(`/api/spaces/${common}/recurring`)
        .send(
          body({
            label: 'Salaire',
            kind: 'INCOME',
            bloc: undefined,
            amountCents: 380000,
            dayOfMonth: 28,
          }),
        )
        .expect(201);
      const yearly = await alice
        .post(`/api/spaces/${common}/recurring`)
        .send(taxe())
        .expect(201);
      taxeId = yearly.body.id;
      expect(yearly.body).toMatchObject({
        frequency: 'YEARLY',
        monthOfYear: 10,
        dayOfMonth: 15,
      });
      const quarterly = await bob
        .post(`/api/spaces/${common}/recurring`)
        .send(
          body({
            label: 'Assurance auto',
            amountCents: 30000,
            dayOfMonth: 5,
            frequency: 'QUARTERLY',
            monthOfYear: 11,
          }),
        )
        .expect(201);
      assuranceId = quarterly.body.id;
      const listed = (
        await alice.get(`/api/spaces/${common}/recurring`).expect(200)
      ).body as {
        label: string;
        frequency: string;
        monthOfYear: number | null;
      }[];
      expect(
        Object.fromEntries(
          listed.map((i) => [i.label, [i.frequency, i.monthOfYear]]),
        ),
      ).toEqual({
        Loyer: ['MONTHLY', null],
        Salaire: ['MONTHLY', null],
        'Taxe foncière': ['YEARLY', 10],
        'Assurance auto': ['QUARTERLY', 11],
      });
      // Un PUT sans frequency repasse en MONTHLY (remplacement complet).
      await alice
        .put(`/api/spaces/${common}/recurring/${monthly.body.id}`)
        .send(body({ label: 'Loyer', frequency: 'MONTHLY', monthOfYear: null }))
        .expect(204);
    });

    it('rejects inconsistent periodicity with a 400', async () => {
      const bad: [string, Record<string, unknown>][] = [
        ['yearly without month', taxe({ monthOfYear: undefined })],
        ['yearly with null month', taxe({ monthOfYear: null })],
        [
          'quarterly without month',
          taxe({ frequency: 'QUARTERLY', monthOfYear: undefined }),
        ],
        ['month 0', taxe({ monthOfYear: 0 })],
        ['month 13', taxe({ monthOfYear: 13 })],
        ['fractional month', taxe({ monthOfYear: 2.5 })],
        [
          'monthly with a month',
          body({ frequency: 'MONTHLY', monthOfYear: 3 }),
        ],
        ['default monthly with a month', body({ monthOfYear: 3 })],
        ['unknown frequency', taxe({ frequency: 'WEEKLY' })],
      ];
      for (const [name, payload] of bad) {
        const response = await alice
          .post(`/api/spaces/${common}/recurring`)
          .send(payload);
        expect({ name, status: response.status }).toEqual({
          name,
          status: 400,
        });
      }
      const domain = await alice
        .post(`/api/spaces/${common}/recurring`)
        .send(taxe({ monthOfYear: undefined }))
        .expect(400);
      expect(domain.body.message).toContain("mois de l'année");
      await alice
        .put(`/api/spaces/${common}/recurring/${taxeId}`)
        .send(taxe({ monthOfYear: null }))
        .expect(400);
    });
  });

  describe('provisions', () => {
    it('answers with the contract shape', async () => {
      const response = await bob
        .get(`/api/spaces/${common}/provisions`)
        .expect(200);
      expect(response.body).toEqual({
        asOf: '2026-10-30',
        items: [
          {
            recurringId: assuranceId,
            label: 'Assurance auto',
            bloc: 'FIXE',
            frequency: 'QUARTERLY',
            amountCents: 30000,
            nextDueDate: '2026-11-05',
            monthsUntilDue: 0,
            monthlyProvisionCents: 10000,
            provisionedSoFarCents: null,
          },
          {
            recurringId: taxeId,
            label: 'Taxe foncière',
            bloc: 'FIXE',
            frequency: 'YEARLY',
            amountCents: 120000,
            nextDueDate: '2027-10-15',
            monthsUntilDue: 11,
            monthlyProvisionCents: 10000,
            provisionedSoFarCents: null,
          },
        ],
        totalMonthlyProvisionCents: 20000,
        // 4 trimestrialités (5 nov., 5 févr., 5 mai, 5 août) + la taxe foncière.
        totalNextTwelveMonthsCents: 4 * 30000 + 120000,
      });
    });

    it('honours asOf and validates it', async () => {
      const early = (
        await alice
          .get(`/api/spaces/${common}/provisions?asOf=2026-10-01`)
          .expect(200)
      ).body;
      expect(early.asOf).toBe('2026-10-01');
      expect(
        early.items.find((i: { label: string }) => i.label === 'Taxe foncière'),
      ).toMatchObject({
        nextDueDate: '2026-10-15',
        monthsUntilDue: 0,
      });
      const onTheDay = (
        await alice
          .get(`/api/spaces/${common}/provisions?asOf=2027-10-15`)
          .expect(200)
      ).body;
      expect(
        onTheDay.items.map((i: { nextDueDate: string }) => i.nextDueDate),
      ).toContain('2027-10-15');
      for (const bad of ['2026-02-30', '30/10/2026', 'demain', '2026-13-01']) {
        await alice
          .get(`/api/spaces/${common}/provisions?asOf=${bad}`)
          .expect(400);
      }
    });
  });

  describe('year forecast', () => {
    it('answers with the contract shape and flags the peak', async () => {
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
      const response = await bob
        .get(`/api/spaces/${common}/forecast/year?year=2026`)
        .expect(200);
      const year = response.body;
      expect(year.year).toBe(2026);
      expect(year.months).toHaveLength(12);
      expect(year.months[0]).toEqual({
        month: '2026-01',
        incomeCents: 380000,
        expenseCents: 110000,
        balanceCents: 270000,
        cumulativeCents: 270000,
        peak: false,
        items: [
          {
            recurringId: expect.any(String),
            label: 'Loyer',
            kind: 'EXPENSE',
            amountCents: 110000,
          },
          {
            recurringId: expect.any(String),
            label: 'Salaire',
            kind: 'INCOME',
            amountCents: 380000,
          },
        ],
      });
      // Février : assurance trimestrielle ancrée en novembre (nov., fév., mai, août).
      expect(year.months[1].expenseCents).toBe(140000);
      // Octobre : loyer + taxe foncière ; novembre : loyer + assurance.
      expect(year.months[9]).toMatchObject({
        month: '2026-10',
        expenseCents: 230000,
        peak: true,
      });
      expect(year.months[10].expenseCents).toBe(140000);
      // 12 × 110 000 + 4 × 30 000 + 120 000
      expect(year.totalExpenseCents).toBe(1560000);
      expect(year.totalIncomeCents).toBe(12 * 380000);
      expect(year.provisionHintCents).toBe(20000);
      expect(year.months[11].cumulativeCents).toBe(
        year.totalIncomeCents - year.totalExpenseCents,
      );
    });

    it('defaults to the current year, validates the year and completes the common income', async () => {
      expect(
        (await alice.get(`/api/spaces/${common}/forecast/year`).expect(200))
          .body.year,
      ).toBe(2026);
      await alice
        .get(`/api/spaces/${common}/forecast/year?year=abc`)
        .expect(400);
      await alice
        .get(`/api/spaces/${common}/forecast/year?year=1800`)
        .expect(400);
      // Un plan commun sans revenu propre : contributions supposées (somme des blocs) chaque mois.
      await alice
        .put(`/api/spaces/${common}/plan`)
        .send({
          incomeCents: 0,
          fixeCents: 175000,
          courantCents: 100000,
          plaisirCents: 45000,
          epargneCents: 20000,
        })
        .expect(204);
      const year = (
        await alice
          .get(`/api/spaces/${common}/forecast/year?year=2027`)
          .expect(200)
      ).body;
      // Le salaire récurrent (380 000) dépasse le plan (340 000) : le réel prévaut.
      expect(year.months[0].incomeCents).toBe(380000);
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
    });
  });

  describe('monthly forecast, aids and insights use the same occurrences', () => {
    it('only forecasts a non-monthly payment in its months', async () => {
      const month = async (m: string) =>
        (
          await alice
            .get(`/api/spaces/${common}/forecast?month=${m}`)
            .expect(200)
        ).body.occurrences as {
          label: string;
          status: string;
          date: string;
        }[];
      expect((await month('2026-10')).map((o) => o.label)).toEqual([
        'Loyer',
        'Taxe foncière',
        'Salaire',
      ]);
      expect((await month('2026-11')).map((o) => [o.label, o.status])).toEqual([
        ['Assurance auto', 'DUE'],
        ['Loyer', 'DUE'],
        ['Salaire', 'DUE'],
      ]);
      expect((await month('2026-12')).map((o) => o.label)).toEqual([
        'Loyer',
        'Salaire',
      ]);
      expect((await month('2027-02')).map((o) => o.label)).toEqual([
        'Assurance auto',
        'Loyer',
        'Salaire',
      ]);
    });

    it('counts a yearly aided payment once per year', async () => {
      const aided = await alice
        .post(`/api/spaces/${common}/recurring`)
        .send(
          body({
            label: 'Femme de ménage annuelle',
            bloc: 'COURANT',
            amountCents: 120000,
            dayOfMonth: 10,
            frequency: 'YEARLY',
            monthOfYear: 3,
            aidRuleId: 'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE',
          }),
        )
        .expect(201);
      const aids = (
        await alice.get(`/api/spaces/${common}/aids?year=2026`).expect(200)
      ).body;
      expect(aids.rules[0]).toMatchObject({
        ruleId: 'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE',
        spentCents: 120000,
        expectedCreditCents: 60000,
      });
      expect(aids.rules[0].lines[0]).toMatchObject({
        yearlySpentCents: 120000,
        monthlyCents: 10000,
        netMonthlyCents: 5000,
      });
      await alice
        .delete(`/api/spaces/${common}/recurring/${aided.body.id}`)
        .expect(204);
    });

    it('advises on the provision and on a big payment due soon', async () => {
      // On ajoute un impôt annuel de 2 400 € le 20 novembre, et on se place le 12 novembre.
      await alice
        .post(`/api/spaces/${common}/recurring`)
        .send(
          taxe({
            label: 'Impôt sur le revenu',
            amountCents: 240000,
            dayOfMonth: 20,
            monthOfYear: 11,
          }),
        )
        .expect(201);
      clock.set('2026-11-12T09:30:00Z');
      try {
        const insights = (
          await alice
            .get(`/api/spaces/${common}/insights?month=2026-11`)
            .expect(200)
        ).body.insights as {
          id: string;
          severity: string;
          title: string;
          detail: string;
          link: string;
        }[];
        const big = insights.find((i) => i.id === 'upcoming-big-payment')!;
        expect(big).toMatchObject({
          severity: 'INFO',
          title: 'Gros paiement à venir : Impôt sur le revenu',
          link: '/previsionnel',
        });
        expect(big.detail).toBe(
          `Impôt sur le revenu (20 nov.) : 2${NBSP}400${NBSP}€. Mettez 200${NBSP}€ par mois de côté pour le lisser.`,
        );
        // Provision totale : taxe 100 € + assurance 100 € + impôt 200 € = 400 € > épargne prévue 200 €.
        const suggestion = insights.find(
          (i) => i.id === 'provision-suggestion',
        )!;
        expect(suggestion).toMatchObject({ severity: 'INFO', link: '/plan' });
        expect(suggestion.detail).toContain(`demandent 400${NBSP}€ par mois`);
        expect(suggestion.detail).toContain(`n'en prévoit que 200${NBSP}€`);
        expect(insights.length).toBeLessThanOrEqual(8);
      } finally {
        clock.set('2026-10-30T09:30:00Z');
      }
    });
  });

  describe('personal spaces: encryption and isolation', () => {
    it('encrypts a personal yearly payment like the rest and keeps periodicity in clear', async () => {
      const created = await alice
        .post(`/api/spaces/${alicePersonal}/recurring`)
        .send(
          taxe({
            label: 'Cotisation secrète',
            amountCents: 54321,
            monthOfYear: 6,
          }),
        )
        .expect(201);
      expect(created.body).toMatchObject({
        label: 'Cotisation secrète',
        amountCents: 54321,
        frequency: 'YEARLY',
        monthOfYear: 6,
      });
      const raw: Record<string, unknown>[] = await dataSource.query(
        `SELECT * FROM recurring_items WHERE space_id = ?`,
        [alicePersonal],
      );
      expect(raw).toHaveLength(1);
      expect(raw[0].label).toBeNull();
      expect(raw[0].amount_cents).toBeNull();
      expect(String(raw[0].secret_payload).startsWith('v1.')).toBe(true);
      expect(JSON.stringify(raw)).not.toContain('secrète');
      expect(raw[0]).toMatchObject({ frequency: 'YEARLY', month_of_year: 6 });
      const provisions = (
        await alice.get(`/api/spaces/${alicePersonal}/provisions`).expect(200)
      ).body;
      expect(provisions.items).toEqual([
        expect.objectContaining({
          label: 'Cotisation secrète',
          amountCents: 54321,
          monthlyProvisionCents: 4527,
        }),
      ]);
      expect(
        (
          await alice
            .get(`/api/spaces/${alicePersonal}/forecast/year?year=2027`)
            .expect(200)
        ).body.months[5].items[0],
      ).toMatchObject({ label: 'Cotisation secrète' });
    });

    it('gives the other member a 404 on the new routes of a personal space', async () => {
      await bob.get(`/api/spaces/${alicePersonal}/provisions`).expect(404);
      await bob
        .get(`/api/spaces/${alicePersonal}/forecast/year?year=2026`)
        .expect(404);
      await alice.get(`/api/spaces/${alicePersonal}/provisions`).expect(200);
      const provisions = (
        await bob.get(`/api/spaces/${common}/provisions`).expect(200)
      ).body;
      expect(JSON.stringify(provisions)).not.toContain('secrète');
    });

    it('requires authentication', async () => {
      const anonymous = request(app.getHttpServer());
      await anonymous.get(`/api/spaces/${common}/provisions`).expect(401);
      await anonymous.get(`/api/spaces/${common}/forecast/year`).expect(401);
    });
  });
});
