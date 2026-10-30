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

describe('Debts API (tranche 8, end to end, AUTH_MODE=dev, in-memory SQLite)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  const clock = FakeClock.at('2026-10-30T09:30:00Z');
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

    alice = request.agent(app.getHttpServer());
    await alice.get('/api/auth/dev-login?as=alice').expect(302);
    bob = request.agent(app.getHttpServer());
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
    const joined = await bob
      .post('/api/household/join')
      .send({ code })
      .expect(200);
    bobPersonal = (joined.body.spaces as { id: string; kind: string }[]).find(
      (s) => s.kind === 'PERSONAL',
    )!.id;
  });

  afterAll(async () => {
    await app.close();
    process.env = env;
  });

  const body = (over: Record<string, unknown> = {}) => ({
    name: 'Prêt auto',
    kind: 'CAR',
    principalCents: 1500000,
    remainingCents: 1120000,
    annualRatePercent: 3.9,
    monthlyPaymentCents: 32000,
    startDate: '2024-09-01',
    paymentDay: 5,
    insuranceMonthlyCents: 1500,
    ...over,
  });
  const house = (over: Record<string, unknown> = {}) =>
    body({
      name: 'Maison',
      kind: 'MORTGAGE',
      principalCents: 12000000,
      remainingCents: 10000000,
      annualRatePercent: 3.5,
      monthlyPaymentCents: 58000,
      insuranceMonthlyCents: 3000,
      ...over,
    });

  type DebtBody = {
    id: string;
    name: string;
    archived: boolean;
    neverPaidOff?: boolean;
    recurringId: string | null;
  };
  const debtsOf = async (agent: Agent, space: string) =>
    (await agent.get(`/api/spaces/${space}/debts`).expect(200))
      .body as DebtBody[];

  let car: string;
  let mortgage: string;

  it('requires authentication on every route', async () => {
    const anonymous = request(app.getHttpServer());
    const base = `/api/spaces/${common}/debts`;
    await anonymous.get(base).expect(401);
    await anonymous.get(`${base}/summary`).expect(401);
    await anonymous.post(base).send(body()).expect(401);
    await anonymous.put(`${base}/x`).send(body()).expect(401);
    await anonymous.delete(`${base}/x`).expect(401);
    await anonymous.get(`${base}/x/what-if?extraMonthlyCents=100`).expect(401);
  });

  describe('debts', () => {
    it('creates a debt and answers with the contract shape', async () => {
      expect(await debtsOf(alice, common)).toEqual([]);
      const created = await alice
        .post(`/api/spaces/${common}/debts`)
        .send(body())
        .expect(201);
      car = created.body.id;
      expect(created.body).toEqual({
        id: expect.any(String),
        spaceId: common,
        name: 'Prêt auto',
        kind: 'CAR',
        principalCents: 1500000,
        remainingCents: 1120000,
        annualRatePercent: 3.9,
        monthlyPaymentCents: 32000,
        startDate: '2024-09-01',
        paymentDay: 5,
        insuranceMonthlyCents: 1500,
        monthsRemaining: 38,
        payoffDate: '2029-12-05',
        totalInterestRemainingCents: 70926,
        paidSharePercent: 25,
        archived: false,
        recurringId: null,
      });
      expect(await debtsOf(bob, common)).toHaveLength(1);
      mortgage = (
        await bob.post(`/api/spaces/${common}/debts`).send(house()).expect(201)
      ).body.id;
    });

    it('rejects invalid bodies with a 400 and a French message', async () => {
      const bad: [string, Record<string, unknown>][] = [
        ['empty name', body({ name: '  ' })],
        ['long name', body({ name: 'x'.repeat(61) })],
        ['unknown kind', body({ kind: 'YACHT' })],
        ['zero principal', body({ principalCents: 0 })],
        ['fractional principal', body({ principalCents: 10.5 })],
        ['negative remaining', body({ remainingCents: -1 })],
        ['remaining above principal', body({ remainingCents: 1500001 })],
        ['rate with 3 decimals', body({ annualRatePercent: 3.905 })],
        ['negative rate', body({ annualRatePercent: -1 })],
        ['rate above 100', body({ annualRatePercent: 101 })],
        ['text rate', body({ annualRatePercent: '3.9' })],
        ['negative payment', body({ monthlyPaymentCents: -5 })],
        ['negative insurance', body({ insuranceMonthlyCents: -5 })],
        ['payment day 0', body({ paymentDay: 0 })],
        ['payment day 29', body({ paymentDay: 29 })],
        ['impossible start date', body({ startDate: '2026-02-30' })],
        ['bad date format', body({ startDate: '01/09/2024' })],
        ['missing payment day', body({ paymentDay: undefined })],
        ['numeric recurringId', body({ recurringId: 123 })],
        ['unknown recurringId', body({ recurringId: 'nope' })],
      ];
      for (const [name, payload] of bad) {
        const response = await alice
          .post(`/api/spaces/${common}/debts`)
          .send(payload);
        expect({ name, status: response.status }).toEqual({
          name,
          status: 400,
        });
      }
      const domain = await alice
        .post(`/api/spaces/${common}/debts`)
        .send(body({ annualRatePercent: 3.905 }))
        .expect(400);
      expect(domain.body.message).toBe(
        'Le taux annuel accepte 2 décimales au plus',
      );
      const dto = await alice
        .post(`/api/spaces/${common}/debts`)
        .send(body({ paymentDay: 29 }))
        .expect(400);
      expect(JSON.stringify(dto.body.message)).toContain(
        'paymentDay doit être compris entre 1 et 28',
      );
      expect(await debtsOf(alice, common)).toHaveLength(2);
    });

    it('accepts rates of 0 % and with two decimals', async () => {
      for (const rate of [0, 0.07, 12.34, 100]) {
        const created = await alice
          .post(`/api/spaces/${common}/debts`)
          .send(body({ name: `Taux ${rate}`, annualRatePercent: rate }))
          .expect(201);
        expect(created.body.annualRatePercent).toBe(rate);
        await alice
          .delete(`/api/spaces/${common}/debts/${created.body.id}`)
          .expect(204);
      }
      // 0 % : 11 200 € / 320 € = 35 mensualités, aucun intérêt.
      const zero = await alice
        .post(`/api/spaces/${common}/debts`)
        .send(body({ name: 'Sans intérêt', annualRatePercent: 0 }))
        .expect(201);
      expect(zero.body).toMatchObject({
        monthsRemaining: 35,
        totalInterestRemainingCents: 0,
      });
      await alice
        .delete(`/api/spaces/${common}/debts/${zero.body.id}`)
        .expect(204);
    });

    it('flags a debt that never decreases (neverPaidOff, nulls) without failing the request', async () => {
      // 11 200 € à 3,9 % : 36,40 € d'intérêts le premier mois.
      const stuck = await alice
        .post(`/api/spaces/${common}/debts`)
        .send(body({ name: 'Bloqué', monthlyPaymentCents: 3640 }))
        .expect(201);
      expect(stuck.body).toMatchObject({
        neverPaidOff: true,
        monthsRemaining: null,
        payoffDate: null,
        totalInterestRemainingCents: null,
        paidSharePercent: 25,
      });
      const listed = await debtsOf(alice, common);
      expect(listed.find((d) => d.name === 'Bloqué')!.neverPaidOff).toBe(true);
      expect(
        listed.find((d) => d.name === 'Prêt auto')!.neverPaidOff,
      ).toBeUndefined();
      await alice
        .delete(`/api/spaces/${common}/debts/${stuck.body.id}`)
        .expect(204);
    });

    it('updates, archives (listed last), links a recurring payment of the space and deletes', async () => {
      const recurring = (
        await alice
          .post(`/api/spaces/${common}/recurring`)
          .send({
            kind: 'EXPENSE',
            bloc: 'FIXE',
            label: 'Mensualité auto',
            amountCents: 32000,
            dayOfMonth: 5,
            startDate: '2024-09-01',
            active: true,
          })
          .expect(201)
      ).body.id as string;
      await bob
        .put(`/api/spaces/${common}/debts/${car}`)
        .send(
          body({
            remainingCents: 1000000,
            recurringId: recurring,
            archived: true,
          }),
        )
        .expect(204);
      const listed = await debtsOf(alice, common);
      expect(listed.map((d) => [d.name, d.archived])).toEqual([
        ['Maison', false],
        ['Prêt auto', true],
      ]);
      expect(listed[1].recurringId).toBe(recurring);
      // `archived` absent : inchangé ; recurringId absent : détaché.
      await alice
        .put(`/api/spaces/${common}/debts/${car}`)
        .send(body())
        .expect(204);
      const after = (await debtsOf(alice, common)).find((d) => d.id === car)!;
      expect(after.archived).toBe(true);
      expect(after.recurringId).toBeNull();
      await alice
        .put(`/api/spaces/${common}/debts/${car}`)
        .send(body({ archived: false }))
        .expect(204);
      await alice
        .put(`/api/spaces/${common}/debts/nope`)
        .send(body())
        .expect(404);
      await alice.delete(`/api/spaces/${common}/debts/nope`).expect(404);
      await alice
        .put(`/api/spaces/${common}/debts/${car}`)
        .send(body({ principalCents: 0 }))
        .expect(400);
      // Un récurrent d'un autre espace est refusé.
      const personalRecurring = (
        await alice
          .post(`/api/spaces/${alicePersonal}/recurring`)
          .send({
            kind: 'EXPENSE',
            bloc: 'FIXE',
            label: 'Perso',
            amountCents: 100,
            dayOfMonth: 5,
            startDate: '2026-01-01',
            active: true,
          })
          .expect(201)
      ).body.id as string;
      await alice
        .put(`/api/spaces/${common}/debts/${car}`)
        .send(body({ recurringId: personalRecurring }))
        .expect(400);
      await alice
        .post(`/api/spaces/${common}/debts`)
        .send(body({ name: 'X', recurringId: personalRecurring }))
        .expect(400);
    });
  });

  describe('summary', () => {
    it('is served before any :id route and follows the contract', async () => {
      // Maison : 580 + 30 ; auto : 320 + 15 -> 945 € par mois ; revenu connu : 3 000 € (Alice seule).
      const summary = await bob
        .get(`/api/spaces/${common}/debts/summary`)
        .expect(200);
      expect(summary.body).toEqual({
        activeCount: 2,
        totalRemainingCents: 10000000 + 1120000,
        totalMonthlyCents: 58000 + 3000 + 32000 + 1500,
        debtToIncomePercent: 32, // 94 500 / 300 000 = 31,5 -> 32
      });
      await bob
        .put('/api/household/me/income')
        .send({ netMonthlyIncomeCents: 100000 })
        .expect(204);
      expect(
        (await alice.get(`/api/spaces/${common}/debts/summary`).expect(200))
          .body.debtToIncomePercent,
      ).toBe(24); // 94 500 / 400 000 = 23,6
      await bob
        .put('/api/household/me/income')
        .send({ netMonthlyIncomeCents: null })
        .expect(204);
    });

    it('returns a null ratio when no income is known', async () => {
      await alice
        .put('/api/household/me/income')
        .send({ netMonthlyIncomeCents: null })
        .expect(204);
      expect(
        (await alice.get(`/api/spaces/${common}/debts/summary`).expect(200))
          .body.debtToIncomePercent,
      ).toBeNull();
      await alice
        .put('/api/household/me/income')
        .send({ netMonthlyIncomeCents: 300000 })
        .expect(204);
    });
  });

  describe('what-if', () => {
    const url = (id: string, query: string) =>
      `/api/spaces/${common}/debts/${id}/what-if?${query}`;

    it('simulates an extra monthly payment and a partial repayment (hand-checked figures)', async () => {
      const extra = await alice
        .get(url(mortgage, 'extraMonthlyCents=10000'))
        .expect(200);
      expect(extra.body).toEqual({
        baseline: {
          monthsRemaining: 240,
          totalInterestRemainingCents: 3918606,
          payoffDate: '2046-10-05',
        },
        scenario: {
          monthsRemaining: 193,
          totalInterestRemainingCents: 3080395,
          payoffDate: '2042-11-05',
        },
        interestSavedCents: 838211,
        monthsSaved: 47,
        note: 'Vérifiez les indemnités de remboursement anticipé de votre contrat.',
      });
      const both = (
        await alice
          .get(url(mortgage, 'extraMonthlyCents=10000&lumpSumCents=2000000'))
          .expect(200)
      ).body;
      expect(both.scenario).toMatchObject({
        monthsRemaining: 145,
        totalInterestRemainingCents: 1812835,
      });
      expect(both.monthsSaved).toBe(95);
      // Exemple du contrat : l'auto sur 38 mois, échéance finale le 5 décembre 2029.
      const carRun = (
        await alice.get(url(car, 'extraMonthlyCents=5000')).expect(200)
      ).body;
      expect(carRun.baseline).toEqual({
        monthsRemaining: 38,
        totalInterestRemainingCents: 70926,
        payoffDate: '2029-12-05',
      });
      expect(carRun.scenario.monthsRemaining).toBeLessThan(38);
    });

    it('caps the amounts at the remaining capital and never promises a negative saving', async () => {
      const lump = (
        await alice.get(url(mortgage, 'lumpSumCents=99999999999')).expect(200)
      ).body;
      expect(lump.scenario).toEqual({
        monthsRemaining: 0,
        totalInterestRemainingCents: 0,
        payoffDate: null,
      });
      expect(lump.interestSavedCents).toBe(3918606);
      expect(lump.monthsSaved).toBe(240);
      const extra = (
        await alice
          .get(url(mortgage, 'extraMonthlyCents=99999999999'))
          .expect(200)
      ).body;
      expect(extra.scenario).toEqual({
        monthsRemaining: 1,
        totalInterestRemainingCents: 29167,
        payoffDate: '2026-11-05',
      });
      const tiny = (
        await alice.get(url(mortgage, 'extraMonthlyCents=1')).expect(200)
      ).body;
      expect(tiny.interestSavedCents).toBe(92);
      expect(tiny.monthsSaved).toBe(0);
    });

    it('answers 400 without a positive amount or with invalid amounts, 404 for an unknown debt', async () => {
      await alice.get(url(mortgage, '')).expect(400);
      await alice
        .get(url(mortgage, 'extraMonthlyCents=0&lumpSumCents=0'))
        .expect(400);
      for (const bad of [
        'extraMonthlyCents=-1',
        'lumpSumCents=-5',
        'extraMonthlyCents=1.5',
        'extraMonthlyCents=abc',
        'lumpSumCents=1e3x',
      ]) {
        await alice.get(url(mortgage, bad)).expect(400);
      }
      await alice.get(url(mortgage, 'lumpSumCents=1')).expect(200);
      await alice.get(url('nope', 'extraMonthlyCents=100')).expect(404);
    });

    it('compares nothing when the current schedule never ends', async () => {
      const stuck = (
        await alice
          .post(`/api/spaces/${common}/debts`)
          .send(
            house({
              name: 'Bloquée',
              monthlyPaymentCents: 30000,
              annualRatePercent: 3.6,
            }),
          )
          .expect(201)
      ).body.id as string;
      const result = (
        await alice.get(url(stuck, 'extraMonthlyCents=10000')).expect(200)
      ).body;
      expect(result.baseline).toEqual({
        monthsRemaining: null,
        totalInterestRemainingCents: null,
        payoffDate: null,
        neverPaidOff: true,
      });
      expect(result.scenario).toMatchObject({
        monthsRemaining: 463,
        totalInterestRemainingCents: 8511643,
      });
      expect(result.interestSavedCents).toBeNull();
      expect(result.monthsSaved).toBeNull();
      await alice.delete(`/api/spaces/${common}/debts/${stuck}`).expect(204);
    });
  });

  describe('insights', () => {
    type Insight = {
      id: string;
      severity: string;
      title: string;
      detail: string;
      link: string;
      lesson: number | null;
    };
    const insightsOf = async (agent: Agent, space: string, month: string) =>
      (
        await agent
          .get(`/api/spaces/${space}/insights?month=${month}`)
          .expect(200)
      ).body.insights as Insight[];

    it('warns above 35 % of the income and flags a debt that never decreases', async () => {
      // Bob (revenu inconnu) : 3 000 € de revenus. Mensualités : 945 € = 31,5 % -> 32 %, sous le seuil.
      expect(
        (await insightsOf(bob, common, '2026-10')).map((i) => i.id),
      ).not.toContain('debt-ratio-high');
      const big = (
        await alice
          .post(`/api/spaces/${common}/debts`)
          .send(
            body({
              name: 'Conso',
              kind: 'CONSUMER',
              principalCents: 500000,
              remainingCents: 300000,
              monthlyPaymentCents: 20000,
              insuranceMonthlyCents: 0,
            }),
          )
          .expect(201)
      ).body.id as string;
      // 945 € + 200 € = 1 145 € / 3 000 € = 38,17 % -> 38 %
      const high = (await insightsOf(bob, common, '2026-10')).find(
        (i) => i.id === 'debt-ratio-high',
      )!;
      expect(high).toMatchObject({
        severity: 'WARNING',
        title: 'Endettement à 38 % de vos revenus',
        link: '/dettes',
        lesson: 5,
      });
      expect(high.detail).toContain(`1${NBSP}145${NBSP}€ par mois`);

      const stuck = (
        await alice
          .post(`/api/spaces/${common}/debts`)
          .send(body({ name: 'Bloqué', monthlyPaymentCents: 3000 }))
          .expect(201)
      ).body.id as string;
      const never = (await insightsOf(alice, common, '2026-10')).find(
        (i) => i.id === 'debt-never-paid-off',
      )!;
      expect(never).toMatchObject({
        severity: 'ACTION',
        title: 'Le crédit « Bloqué » ne diminue pas',
        link: '/dettes',
      });
      expect(never.detail).toContain(`mensualité de 30${NBSP}€`);
      expect(never.detail).toContain(`(36,40${NBSP}€)`);

      // Hors mois courant : rien. Archivé : plus de conseil.
      expect(
        (await insightsOf(alice, common, '2026-09')).map((i) => i.id),
      ).not.toEqual(expect.arrayContaining(['debt-never-paid-off']));
      expect(
        (await insightsOf(alice, common, '2026-11')).map((i) => i.id),
      ).not.toContain('debt-ratio-high');
      await alice
        .put(`/api/spaces/${common}/debts/${stuck}`)
        .send(
          body({ name: 'Bloqué', monthlyPaymentCents: 3000, archived: true }),
        )
        .expect(204);
      expect(
        (await insightsOf(alice, common, '2026-10')).map((i) => i.id),
      ).not.toContain('debt-never-paid-off');
      await alice.delete(`/api/spaces/${common}/debts/${stuck}`).expect(204);
      await alice.delete(`/api/spaces/${common}/debts/${big}`).expect(204);
      expect(
        (await insightsOf(alice, common, '2026-10')).map((i) => i.id),
      ).not.toContain('debt-ratio-high');
    });
  });

  describe('personal debts: encryption and isolation', () => {
    let secretDebt: string;

    it('encrypts name, amounts and rate at rest and shows them to the owner only', async () => {
      const created = await alice
        .post(`/api/spaces/${alicePersonal}/debts`)
        .send(
          body({
            name: 'Prêt famille secret',
            principalCents: 777777,
            remainingCents: 555555,
            annualRatePercent: 4.25,
            monthlyPaymentCents: 12345,
            insuranceMonthlyCents: 987,
          }),
        )
        .expect(201);
      secretDebt = created.body.id;
      expect(created.body).toMatchObject({
        name: 'Prêt famille secret',
        principalCents: 777777,
        remainingCents: 555555,
        annualRatePercent: 4.25,
        monthlyPaymentCents: 12345,
        insuranceMonthlyCents: 987,
      });

      const rows: Record<string, unknown>[] = await dataSource.query(
        `SELECT * FROM debts WHERE space_id = ?`,
        [alicePersonal],
      );
      expect(rows).toHaveLength(1);
      for (const column of [
        'name',
        'principal_cents',
        'remaining_cents',
        'annual_rate_hundredths',
        'monthly_payment_cents',
        'insurance_monthly_cents',
      ]) {
        expect(rows[0][column]).toBeNull();
      }
      expect(String(rows[0].secret_payload).startsWith('v1.')).toBe(true);
      const raw = JSON.stringify([
        rows[0].name,
        rows[0].principal_cents,
        rows[0].remaining_cents,
        rows[0].annual_rate_hundredths,
        rows[0].monthly_payment_cents,
        rows[0].insurance_monthly_cents,
        rows[0].secret_payload,
      ]);
      for (const secret of [
        'famille',
        'secret',
        '777777',
        '555555',
        '12345',
        '987',
        '425',
        '4.25',
      ]) {
        expect(raw).not.toContain(secret);
      }
      // Les métadonnées de planification restent en clair.
      expect(rows[0]).toMatchObject({
        kind: 'CAR',
        start_date: '2024-09-01',
        payment_day: 5,
        archived: 0,
      });

      // Le commun est en clair, le taux en centièmes de pourcent entiers.
      const common_: {
        name: string;
        annual_rate_hundredths: number;
        monthly_payment_cents: number;
      }[] = await dataSource.query(
        `SELECT name, annual_rate_hundredths, monthly_payment_cents FROM debts WHERE space_id = ? AND name = 'Prêt auto'`,
        [common],
      );
      expect(common_[0]).toEqual({
        name: 'Prêt auto',
        annual_rate_hundredths: 390,
        monthly_payment_cents: 32000,
      });

      expect((await debtsOf(alice, alicePersonal))[0]).toMatchObject({
        name: 'Prêt famille secret',
      });
      expect(
        (
          await alice
            .get(`/api/spaces/${alicePersonal}/debts/summary`)
            .expect(200)
        ).body,
      ).toMatchObject({
        activeCount: 1,
        totalMonthlyCents: 12345 + 987,
        debtToIncomePercent: 4, // 13 332 / 300 000 = 4,44
      });
    });

    it('gives the other member a 404 on every route of a personal space', async () => {
      const base = `/api/spaces/${alicePersonal}/debts`;
      await bob.get(base).expect(404);
      await bob.get(`${base}/summary`).expect(404);
      await bob
        .post(base)
        .send(body({ name: 'Intrusion' }))
        .expect(404);
      await bob
        .put(`${base}/${secretDebt}`)
        .send(body({ name: 'Intrusion' }))
        .expect(404);
      await bob.delete(`${base}/${secretDebt}`).expect(404);
      await bob
        .get(`${base}/${secretDebt}/what-if?extraMonthlyCents=100`)
        .expect(404);
      await bob
        .get(`/api/spaces/${alicePersonal}/insights?month=2026-10`)
        .expect(404);
    });

    it('does not let a debt be reached through another space', async () => {
      for (const space of [common, bobPersonal]) {
        const base = `/api/spaces/${space}/debts`;
        await bob
          .put(`${base}/${secretDebt}`)
          .send(body({ name: 'Intrusion' }))
          .expect(404);
        await bob.delete(`${base}/${secretDebt}`).expect(404);
        await bob
          .get(`${base}/${secretDebt}/what-if?extraMonthlyCents=100`)
          .expect(404);
      }
      await alice
        .delete(`/api/spaces/${common}/debts/${secretDebt}`)
        .expect(404);
      expect(JSON.stringify(await debtsOf(bob, common))).not.toContain(
        'famille',
      );
      expect(await debtsOf(bob, bobPersonal)).toEqual([]);
      expect((await debtsOf(alice, alicePersonal))[0].name).toBe(
        'Prêt famille secret',
      );
    });

    it('simulates a personal debt for its owner and uses the member income for the ratio', async () => {
      const result = (
        await alice
          .get(
            `/api/spaces/${alicePersonal}/debts/${secretDebt}/what-if?lumpSumCents=100000`,
          )
          .expect(200)
      ).body;
      expect(result.scenario.monthsRemaining).toBeLessThan(
        result.baseline.monthsRemaining,
      );
      // Bob n'a pas de revenu : pas de ratio pour son espace personnel.
      await bob
        .post(`/api/spaces/${bobPersonal}/debts`)
        .send(body())
        .expect(201);
      expect(
        (await bob.get(`/api/spaces/${bobPersonal}/debts/summary`).expect(200))
          .body.debtToIncomePercent,
      ).toBeNull();
    });
  });
});
