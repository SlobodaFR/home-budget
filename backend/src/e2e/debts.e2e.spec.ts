import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { Clock } from '../domain/shared/clock';
import { FieldCipher } from '../domain/shared/field-cipher';
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
    // Agent neuf, sans cookie : anonyme, mais depuis le front (meme origine) pour tester l'authentification.
    const anonymous = request
      .agent(app.getHttpServer())
      .set('Sec-Fetch-Site', 'same-origin');
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
        // Tranche 12 : un crédit saisi comme avant prend les valeurs par défaut du contrat.
        lender: '',
        contractReference: '',
        initialTermMonths: null,
        rateType: null,
        insuranceMode: 'FIXED',
        insuranceRatePercent: null,
        insuranceQuotityPercent: 100,
        feesCents: 0,
        guaranteeKind: 'NONE',
        guaranteeCents: 0,
        notes: '',
        monthlyInsuranceCents: 1500,
        monthlyTotalCents: 33500,
        remainingInsuranceCents: 57000,
        remainingCostCents: 70926 + 57000,
        paymentCheck: { status: 'UNKNOWN' },
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
        totalMonthlyInsuranceCents: 3000 + 1500,
        // Maison : 3 918 606 d'intérêts + 240 × 3 000 ; auto : 70 926 + 38 × 1 500.
        totalRemainingCostCents: 3918606 + 240 * 3000 + 70926 + 38 * 1500,
        byLender: [
          {
            lender: '',
            activeCount: 2,
            remainingCents: 10000000 + 1120000,
            monthlyTotalCents: 94500,
          },
        ],
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
        insuranceSavedCents: (240 - 193) * 3000,
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
      expect(result.insuranceSavedCents).toBeNull();
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
      ]);
      // Le chiffré se cherche dans ses octets décodés : son texte base64url peut contenir par
      // hasard une courte suite de chiffres (« 425 », « 987 ») sans rien révéler.
      const decodedPayload = String(rows[0].secret_payload)
        .split('.')
        .slice(1)
        .map((part) => Buffer.from(part, 'base64url').toString('latin1'))
        .join('');
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
        expect(decodedPayload).not.toContain(secret);
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

  describe('enriched loans (tranche 12)', () => {
    const full = (over: Record<string, unknown> = {}) =>
      body({
        name: 'Maison Crédit Agricole',
        kind: 'MORTGAGE',
        principalCents: 10000000,
        remainingCents: 10000000,
        annualRatePercent: 3.5,
        monthlyPaymentCents: 57996,
        insuranceMonthlyCents: 0,
        lender: 'Crédit Agricole',
        contractReference: 'PRET-12345',
        initialTermMonths: 240,
        rateType: 'FIXED',
        insuranceMode: 'PERCENT_INITIAL',
        insuranceRatePercent: 0.36,
        insuranceQuotityPercent: 200,
        feesCents: 90000,
        guaranteeKind: 'SURETY',
        guaranteeCents: 150000,
        notes: 'Remboursement anticipé : 3 % max des sommes remboursées.',
        ...over,
      });
    const post = (space: string, payload: Record<string, unknown>) =>
      alice.post(`/api/spaces/${space}/debts`).send(payload);
    const remove = (space: string, id: string) =>
      alice.delete(`/api/spaces/${space}/debts/${id}`).expect(204);

    it('creates a loan with every field and returns them with the computed indicators', async () => {
      const created = await post(common, full()).expect(201);
      expect(created.body).toEqual({
        id: expect.any(String),
        spaceId: common,
        name: 'Maison Crédit Agricole',
        kind: 'MORTGAGE',
        principalCents: 10000000,
        remainingCents: 10000000,
        annualRatePercent: 3.5,
        monthlyPaymentCents: 57996,
        startDate: '2024-09-01',
        paymentDay: 5,
        insuranceMonthlyCents: 0,
        monthsRemaining: 240,
        payoffDate: '2046-10-05',
        totalInterestRemainingCents: 3919029,
        paidSharePercent: 0,
        archived: false,
        recurringId: null,
        lender: 'Crédit Agricole',
        contractReference: 'PRET-12345',
        initialTermMonths: 240,
        rateType: 'FIXED',
        insuranceMode: 'PERCENT_INITIAL',
        insuranceRatePercent: 0.36,
        insuranceQuotityPercent: 200,
        feesCents: 90000,
        guaranteeKind: 'SURETY',
        guaranteeCents: 150000,
        notes: 'Remboursement anticipé : 3 % max des sommes remboursées.',
        // 100 000 € × 0,36 % × 200 % / 12 = 60 €
        monthlyInsuranceCents: 6000,
        monthlyTotalCents: 63996,
        remainingInsuranceCents: 240 * 6000,
        remainingCostCents: 3919029 + 240 * 6000,
        paymentCheck: {
          status: 'OK',
          expectedMonthlyPaymentCents: 57996,
          differenceCents: 0,
          differencePercent: 0,
        },
      });
      const listed = (
        await alice.get(`/api/spaces/${common}/debts`).expect(200)
      ).body as { id: string }[];
      expect(listed.find((d) => d.id === created.body.id)).toEqual(
        created.body,
      );
      await remove(common, created.body.id);
    });

    it('computes the three insurance modes (integers, quotity applied to the percentage modes only)', async () => {
      const make = async (over: Record<string, unknown>) => {
        const response = await post(common, full(over)).expect(201);
        await remove(common, response.body.id as string);
        return response.body as Record<string, number>;
      };
      // FIXED : tel que saisi, la quotité est ignorée, le taux aussi.
      const fixed = await make({
        insuranceMode: 'FIXED',
        insuranceMonthlyCents: 4500,
        insuranceRatePercent: null,
        insuranceQuotityPercent: 50,
      });
      expect(fixed).toMatchObject({
        insuranceMode: 'FIXED',
        insuranceRatePercent: null,
        monthlyInsuranceCents: 4500,
        monthlyTotalCents: 57996 + 4500,
        remainingInsuranceCents: 240 * 4500,
      });
      // PERCENT_INITIAL : 100 000 € × 0,36 % / 12 = 30 € (quotité 100).
      const initial = await make({ insuranceQuotityPercent: 100 });
      expect(initial.monthlyInsuranceCents).toBe(3000);
      expect(initial.remainingInsuranceCents).toBe(240 * 3000);
      // PERCENT_REMAINING : 30 € le premier mois, puis moins à mesure que le capital baisse.
      const remaining = await make({
        insuranceMode: 'PERCENT_REMAINING',
        insuranceQuotityPercent: 100,
      });
      expect(remaining.monthlyInsuranceCents).toBe(3000);
      expect(remaining.remainingInsuranceCents).toBeLessThan(240 * 3000);
      expect(remaining.remainingInsuranceCents).toBeGreaterThan(120 * 3000);
      expect(remaining.remainingCostCents).toBe(
        remaining.totalInterestRemainingCents +
          remaining.remainingInsuranceCents,
      );
    });

    it('checks the entered payment against the original loan: OK, GAP and UNKNOWN', async () => {
      const check = async (over: Record<string, unknown>) => {
        const response = await post(common, full(over)).expect(201);
        await remove(common, response.body.id as string);
        return response.body.paymentCheck as { status: string };
      };
      expect(await check({ monthlyPaymentCents: 58000 })).toEqual({
        status: 'OK',
        expectedMonthlyPaymentCents: 57996,
        differenceCents: 4,
        differencePercent: 0,
      });
      expect(await check({ monthlyPaymentCents: 40000 })).toEqual({
        status: 'GAP',
        expectedMonthlyPaymentCents: 57996,
        differenceCents: -17996,
        differencePercent: -31,
      });
      // Exactement 2 % de 579,96 € = 11,60 € : 11,59 € OK, 11,60 € (1 160 > 1 159,92) GAP.
      expect((await check({ monthlyPaymentCents: 57996 + 1159 })).status).toBe(
        'OK',
      );
      expect((await check({ monthlyPaymentCents: 57996 + 1160 })).status).toBe(
        'GAP',
      );
      // Taux variable ou révisable, durée inconnue : pas de jugement.
      for (const over of [
        { rateType: 'VARIABLE' },
        { rateType: 'ADJUSTABLE' },
        { initialTermMonths: null },
      ]) {
        expect(await check({ ...over, monthlyPaymentCents: 1000 })).toEqual({
          status: 'UNKNOWN',
        });
      }
      // Taux 0 % : 100 000 € sur 240 mois = 416,67 € (arrondi au-dessus).
      expect(
        await check({
          annualRatePercent: 0,
          monthlyPaymentCents: 41667,
        }),
      ).toMatchObject({ status: 'OK', expectedMonthlyPaymentCents: 41667 });
      // Durée de 1 mois : capital + intérêts du mois.
      expect(
        await check({
          initialTermMonths: 1,
          monthlyPaymentCents: 10029167,
        }),
      ).toMatchObject({ status: 'OK', expectedMonthlyPaymentCents: 10029167 });
    });

    it('never alters the entered amounts when flagging a gap', async () => {
      const created = await post(
        common,
        full({ monthlyPaymentCents: 40000 }),
      ).expect(201);
      expect(created.body.paymentCheck.status).toBe('GAP');
      const read = (await debtsOf(alice, common)).find(
        (d) => d.id === created.body.id,
      ) as unknown as Record<string, unknown>;
      expect(read).toMatchObject({
        monthlyPaymentCents: 40000,
        principalCents: 10000000,
        annualRatePercent: 3.5,
        initialTermMonths: 240,
      });
      await remove(common, created.body.id);
    });

    it('replaces the whole loan on PUT: absent fields take their default', async () => {
      const created = await post(common, full()).expect(201);
      await alice
        .put(`/api/spaces/${common}/debts/${created.body.id}`)
        .send(body({ name: 'Maison Crédit Agricole' }))
        .expect(204);
      const after = (await debtsOf(alice, common)).find(
        (d) => d.id === created.body.id,
      );
      expect(after).toMatchObject({
        lender: '',
        contractReference: '',
        initialTermMonths: null,
        rateType: null,
        insuranceMode: 'FIXED',
        insuranceRatePercent: null,
        insuranceQuotityPercent: 100,
        feesCents: 0,
        guaranteeKind: 'NONE',
        guaranteeCents: 0,
        notes: '',
        paymentCheck: { status: 'UNKNOWN' },
      });
      await remove(common, created.body.id);
    });

    it('rejects invalid values with a 400 and a French message, and leaves the data untouched', async () => {
      const before = (await debtsOf(alice, common)).length;
      const bad: [string, Record<string, unknown>, string][] = [
        [
          'percent mode without a rate',
          full({ insuranceRatePercent: null }),
          "Indiquez le taux d'assurance",
        ],
        [
          'percent mode, rate absent',
          full({ insuranceRatePercent: undefined }),
          "Indiquez le taux d'assurance",
        ],
        [
          'remaining mode without a rate',
          full({
            insuranceMode: 'PERCENT_REMAINING',
            insuranceRatePercent: undefined,
          }),
          "Indiquez le taux d'assurance",
        ],
        [
          '3 decimals on the insurance rate',
          full({ insuranceRatePercent: 0.155 }),
          "Le taux d'assurance accepte 2 décimales au plus",
        ],
        [
          'rate above 20',
          full({ insuranceRatePercent: 20.01 }),
          'insuranceRatePercent doit être compris entre 0 et 20',
        ],
        [
          'negative rate',
          full({ insuranceRatePercent: -0.1 }),
          'insuranceRatePercent doit être compris entre 0 et 20',
        ],
        [
          'text rate',
          full({ insuranceRatePercent: '0.3' }),
          'insuranceRatePercent doit être un nombre',
        ],
        [
          'quotity 0',
          full({ insuranceQuotityPercent: 0 }),
          'insuranceQuotityPercent doit être compris entre 1 et 200',
        ],
        [
          'quotity 201',
          full({ insuranceQuotityPercent: 201 }),
          'insuranceQuotityPercent doit être compris entre 1 et 200',
        ],
        [
          'fractional quotity',
          full({ insuranceQuotityPercent: 99.5 }),
          'insuranceQuotityPercent doit être un entier',
        ],
        [
          'term 0',
          full({ initialTermMonths: 0 }),
          'initialTermMonths doit être compris entre 1 et 600',
        ],
        [
          'term 601',
          full({ initialTermMonths: 601 }),
          'initialTermMonths doit être compris entre 1 et 600',
        ],
        [
          'fractional term',
          full({ initialTermMonths: 12.5 }),
          'initialTermMonths doit être un nombre entier de mois',
        ],
        [
          'negative fees',
          full({ feesCents: -1 }),
          'feesCents doit être positif ou nul',
        ],
        [
          'fractional fees',
          full({ feesCents: 10.5 }),
          'feesCents doit être un entier',
        ],
        [
          'negative guarantee',
          full({ guaranteeCents: -1 }),
          'guaranteeCents doit être positif ou nul',
        ],
        [
          'guarantee amount without a kind',
          full({ guaranteeKind: 'NONE', guaranteeCents: 100 }),
          'Précisez le type de garantie',
        ],
        [
          'guarantee amount, default kind',
          full({ guaranteeKind: undefined, guaranteeCents: 100 }),
          'Précisez le type de garantie',
        ],
        [
          'unknown guarantee kind',
          full({ guaranteeKind: 'PLEDGE' }),
          'guaranteeKind doit être',
        ],
        [
          'unknown rate type',
          full({ rateType: 'WEIRD' }),
          'rateType doit être',
        ],
        [
          'unknown insurance mode',
          full({ insuranceMode: 'MAGIC' }),
          'insuranceMode doit être',
        ],
        [
          'lender of 81 characters',
          full({ lender: 'x'.repeat(81) }),
          'Nom du prêteur trop long',
        ],
        [
          'reference of 61 characters',
          full({ contractReference: 'x'.repeat(61) }),
          'Référence du contrat trop longue',
        ],
        [
          'notes of 501 characters',
          full({ notes: 'x'.repeat(501) }),
          'Notes trop longues',
        ],
        ['numeric lender', full({ lender: 12 }), 'lender doit être un texte'],
      ];
      for (const [name, payload, message] of bad) {
        const response = await post(common, payload);
        expect({ name, status: response.status }).toEqual({
          name,
          status: 400,
        });
        expect({
          name,
          message: JSON.stringify(response.body.message),
        }).toEqual({
          name,
          message: expect.stringContaining(message),
        });
      }
      // PUT : mêmes contrôles.
      const some = (await debtsOf(alice, common))[0];
      await alice
        .put(`/api/spaces/${common}/debts/${some.id}`)
        .send(full({ insuranceRatePercent: null }))
        .expect(400);
      expect(await debtsOf(alice, common)).toHaveLength(before);
    });

    it('accepts the boundaries and trims the texts', async () => {
      const created = await post(
        common,
        full({
          lender: `  ${'b'.repeat(80)}  `,
          contractReference: ` ${'r'.repeat(60)} `,
          notes: ` ${'n'.repeat(500)} `,
          initialTermMonths: 600,
          insuranceRatePercent: 20,
          insuranceQuotityPercent: 200,
          feesCents: 0,
          guaranteeKind: 'OTHER',
          guaranteeCents: 0,
        }),
      ).expect(201);
      expect(created.body).toMatchObject({
        lender: 'b'.repeat(80),
        contractReference: 'r'.repeat(60),
        notes: 'n'.repeat(500),
        initialTermMonths: 600,
        insuranceRatePercent: 20,
        insuranceQuotityPercent: 200,
      });
      await remove(common, created.body.id);
      for (const over of [
        { initialTermMonths: 1 },
        { insuranceQuotityPercent: 1 },
        { insuranceRatePercent: 0 },
        { rateType: null, insuranceMode: null },
      ]) {
        const ok = await post(common, full(over)).expect(201);
        await remove(common, ok.body.id);
      }
    });

    it('groups the summary by lender (case and spaces ignored, largest remaining capital first)', async () => {
      const ids: string[] = [];
      const add = async (over: Record<string, unknown>) => {
        const response = await post(
          common,
          full({
            rateType: null,
            initialTermMonths: null,
            insuranceMode: 'FIXED',
            insuranceRatePercent: null,
            guaranteeKind: 'NONE',
            guaranteeCents: 0,
            ...over,
          }),
        ).expect(201);
        ids.push(response.body.id);
      };
      await add({
        name: 'CA 1',
        lender: 'Crédit Agricole',
        principalCents: 12000000,
        remainingCents: 5000000,
        monthlyPaymentCents: 30000,
        insuranceMonthlyCents: 1000,
      });
      await add({
        name: 'CA 2',
        lender: '  crédit   AGRICOLE ',
        principalCents: 12000000,
        remainingCents: 3000000,
        monthlyPaymentCents: 20000,
        insuranceMonthlyCents: 500,
      });
      await add({
        name: 'LCL',
        lender: 'LCL',
        principalCents: 12000000,
        remainingCents: 12000000,
        monthlyPaymentCents: 70000,
        insuranceMonthlyCents: 0,
      });
      await add({
        name: 'Archivé',
        lender: 'LCL',
        remainingCents: 9000000,
        monthlyPaymentCents: 90000,
      });
      const summary = (
        await alice.get(`/api/spaces/${common}/debts/summary`).expect(200)
      ).body;
      // Le prêt auto (32 000 + 15 €) et la maison (580 € + 30 €) n'ont pas de prêteur.
      expect(summary.byLender).toEqual([
        {
          lender: 'LCL',
          activeCount: 2,
          remainingCents: 12000000 + 9000000,
          monthlyTotalCents: 70000 + 90000,
        },
        {
          lender: '',
          activeCount: 2,
          remainingCents: 10000000 + 1120000,
          monthlyTotalCents: 94500,
        },
        {
          lender: 'Crédit Agricole',
          activeCount: 2,
          remainingCents: 8000000,
          monthlyTotalCents: 30000 + 1000 + 20000 + 500,
        },
      ]);
      // Maison 30 € + auto 15 € + 10 € + 5 € ; les deux prêts LCL n'ont pas d'assurance.
      expect(summary.totalMonthlyInsuranceCents).toBe(3000 + 1500 + 1000 + 500);
      expect(summary.activeCount).toBe(6);
      expect(summary.totalRemainingCostCents).toBeGreaterThan(0);
      // Le taux d'endettement repose sur mensualités + assurance calculée.
      expect(summary.totalMonthlyCents).toBe(
        94500 + 31000 + 20500 + 70000 + 90000,
      );
      expect(summary.debtToIncomePercent).toBe(
        Math.floor((summary.totalMonthlyCents * 100) / 300000 + 0.5),
      );
      // Archiver retire le crédit du regroupement.
      const archived = ids[3];
      await alice
        .put(`/api/spaces/${common}/debts/${archived}`)
        .send(
          full({
            name: 'Archivé',
            lender: 'LCL',
            archived: true,
            rateType: null,
            initialTermMonths: null,
            insuranceMode: 'FIXED',
            insuranceRatePercent: null,
            guaranteeKind: 'NONE',
            guaranteeCents: 0,
            remainingCents: 9000000,
            monthlyPaymentCents: 90000,
          }),
        )
        .expect(204);
      const after = (
        await alice.get(`/api/spaces/${common}/debts/summary`).expect(200)
      ).body;
      expect(after.byLender[0]).toMatchObject({
        lender: 'LCL',
        activeCount: 1,
        remainingCents: 12000000,
      });
      for (const id of ids) {
        await remove(common, id);
      }
      expect(
        (await alice.get(`/api/spaces/${common}/debts/summary`).expect(200))
          .body.byLender,
      ).toEqual([
        {
          lender: '',
          activeCount: 2,
          remainingCents: 11120000,
          monthlyTotalCents: 94500,
        },
      ]);
    });

    it('what-if reports the insurance saved (percent of the remaining capital falls with a lump sum)', async () => {
      const created = await post(
        common,
        full({
          insuranceMode: 'PERCENT_REMAINING',
          insuranceQuotityPercent: 100,
        }),
      ).expect(201);
      const url = (query: string) =>
        `/api/spaces/${common}/debts/${created.body.id}/what-if?${query}`;
      const extra = (
        await alice.get(url('extraMonthlyCents=20000')).expect(200)
      ).body;
      expect(extra.insuranceSavedCents).toBeGreaterThan(0);
      const lump = (await alice.get(url('lumpSumCents=5000000')).expect(200))
        .body;
      // Rembourser la moitié du capital divise à peu près par deux l'assurance restante.
      expect(lump.insuranceSavedCents).toBeGreaterThan(
        created.body.remainingInsuranceCents / 2 - 1,
      );
      const all = (await alice.get(url('lumpSumCents=99999999999')).expect(200))
        .body;
      expect(all.insuranceSavedCents).toBe(
        created.body.remainingInsuranceCents,
      );
      expect(all.interestSavedCents).toBe(
        created.body.totalInterestRemainingCents,
      );
      // Crédit à assurance fixe : économie = mois gagnés × assurance mensuelle.
      const fixed = await post(
        common,
        full({
          insuranceMode: 'FIXED',
          insuranceRatePercent: null,
          insuranceMonthlyCents: 2500,
        }),
      ).expect(201);
      const saved = (
        await alice
          .get(
            `/api/spaces/${common}/debts/${fixed.body.id}/what-if?extraMonthlyCents=10000`,
          )
          .expect(200)
      ).body;
      expect(saved.insuranceSavedCents).toBe(saved.monthsSaved * 2500);
      expect(saved.monthsSaved).toBeGreaterThan(0);
      await remove(common, fixed.body.id);
      await remove(common, created.body.id);
    });

    describe('debt-payment-gap insight', () => {
      type Insight = {
        id: string;
        severity: string;
        title: string;
        detail: string;
        link: string;
      };
      const insightsOf = async (agent: Agent, space: string, month: string) =>
        (
          await agent
            .get(`/api/spaces/${space}/insights?month=${month}`)
            .expect(200)
        ).body.insights as Insight[];

      it('is raised for an active loan whose payment is far from the original one, for the current month only', async () => {
        const created = await post(
          common,
          full({ name: 'Maison à revérifier', monthlyPaymentCents: 40000 }),
        ).expect(201);
        const gap = (await insightsOf(bob, common, '2026-10')).find(
          (i) => i.id === 'debt-payment-gap',
        )!;
        expect(gap).toMatchObject({
          severity: 'INFO',
          title: 'Mensualité du crédit « Maison à revérifier » à revérifier',
          link: '/dettes',
        });
        expect(gap.detail).toContain(`400${NBSP}€`);
        expect(gap.detail).toContain(`579,96${NBSP}€`);
        expect(gap.detail).toContain('Revérifiez');
        for (const word of ['rachat', 'renégoci', 'refinanc']) {
          expect(JSON.stringify(gap).toLowerCase()).not.toContain(word);
        }
        for (const month of ['2026-09', '2026-11']) {
          expect(
            (await insightsOf(bob, common, month)).map((i) => i.id),
          ).not.toContain('debt-payment-gap');
        }

        // Corrigé : plus de conseil.
        await alice
          .put(`/api/spaces/${common}/debts/${created.body.id}`)
          .send(
            full({ name: 'Maison à revérifier', monthlyPaymentCents: 57996 }),
          )
          .expect(204);
        expect(
          (await insightsOf(bob, common, '2026-10')).map((i) => i.id),
        ).not.toContain('debt-payment-gap');
        // Variable : jamais de jugement. Archivé ou soldé : aucun conseil.
        for (const over of [
          { rateType: 'VARIABLE' },
          { archived: true },
          { remainingCents: 0 },
        ]) {
          await alice
            .put(`/api/spaces/${common}/debts/${created.body.id}`)
            .send(
              full({
                name: 'Maison à revérifier',
                monthlyPaymentCents: 40000,
                ...over,
              }),
            )
            .expect(204);
          expect(
            (await insightsOf(bob, common, '2026-10')).map((i) => i.id),
          ).not.toContain('debt-payment-gap');
        }
        await remove(common, created.body.id);
      });
    });

    describe('legacy credits', () => {
      it('reads a common credit stored before the migration with the contract defaults', async () => {
        await dataSource.query(
          `INSERT INTO "debts" ("id","space_id","kind","start_date","payment_day","archived","name","principal_cents","remaining_cents","annual_rate_hundredths","monthly_payment_cents","insurance_monthly_cents") VALUES ('legacy-common',?, 'CAR','2024-09-01',5,0,'Ancien prêt',1500000,1120000,390,32000,1500)`,
          [common],
        );
        const legacy = (await debtsOf(alice, common)).find(
          (d) => d.id === 'legacy-common',
        );
        expect(legacy).toMatchObject({
          name: 'Ancien prêt',
          lender: '',
          contractReference: '',
          initialTermMonths: null,
          rateType: null,
          insuranceMode: 'FIXED',
          insuranceRatePercent: null,
          insuranceQuotityPercent: 100,
          feesCents: 0,
          guaranteeKind: 'NONE',
          guaranteeCents: 0,
          notes: '',
          monthlyInsuranceCents: 1500,
          monthlyTotalCents: 33500,
          paymentCheck: { status: 'UNKNOWN' },
        });
        await remove(common, 'legacy-common');
      });

      it('reads a personal credit whose encrypted payload predates the migration', async () => {
        const created = await post(
          alicePersonal,
          full({ name: 'Perso ancien' }),
        ).expect(201);
        const id = created.body.id as string;
        const cipher = app.get(FieldCipher, { strict: false });
        const [owner]: { id: string }[] = await dataSource.query(
          `SELECT owner_user_id AS id FROM spaces WHERE id = ?`,
          [alicePersonal],
        );
        const aad = `debt:${alicePersonal}:${id}`;
        const [row]: { payload: string }[] = await dataSource.query(
          `SELECT secret_payload AS payload FROM debts WHERE id = ?`,
          [id],
        );
        const payload = JSON.parse(cipher.decrypt(owner.id, aad, row.payload));
        const legacyPayload = {
          name: payload.name,
          principalCents: payload.principalCents,
          remainingCents: payload.remainingCents,
          annualRateHundredths: payload.annualRateHundredths,
          monthlyPaymentCents: payload.monthlyPaymentCents,
          insuranceMonthlyCents: payload.insuranceMonthlyCents,
        };
        await dataSource.query(
          `UPDATE debts SET secret_payload = ?, rate_type = NULL, insurance_mode = NULL, guarantee_kind = NULL WHERE id = ?`,
          [cipher.encrypt(owner.id, aad, JSON.stringify(legacyPayload)), id],
        );
        const legacy = (await debtsOf(alice, alicePersonal)).find(
          (d) => d.id === id,
        );
        expect(legacy).toMatchObject({
          name: 'Perso ancien',
          principalCents: 10000000,
          monthlyPaymentCents: 57996,
          lender: '',
          initialTermMonths: null,
          rateType: null,
          insuranceMode: 'FIXED',
          insuranceQuotityPercent: 100,
          feesCents: 0,
          guaranteeKind: 'NONE',
          notes: '',
          paymentCheck: { status: 'UNKNOWN' },
        });
        await remove(alicePersonal, id);
      });
    });

    describe('personal space: encryption and isolation', () => {
      let secretId: string;
      const secret = () =>
        full({
          name: 'Prêt perso chiffré',
          lender: 'Banque Secrète Dupont',
          contractReference: 'REF-SECRET-4242',
          notes: 'note très confidentielle',
          principalCents: 8765432,
          remainingCents: 7654321,
          monthlyPaymentCents: 45678,
          initialTermMonths: 237,
          insuranceRatePercent: 0.37,
          insuranceQuotityPercent: 87,
          feesCents: 123457,
          guaranteeCents: 765431,
          guaranteeKind: 'MORTGAGE',
        });

      it('encrypts the lender, reference, notes, term, fees, guarantee and insurance at rest', async () => {
        const created = await post(alicePersonal, secret()).expect(201);
        secretId = created.body.id;
        expect(created.body).toMatchObject({
          lender: 'Banque Secrète Dupont',
          contractReference: 'REF-SECRET-4242',
          notes: 'note très confidentielle',
          initialTermMonths: 237,
          insuranceRatePercent: 0.37,
          insuranceQuotityPercent: 87,
          feesCents: 123457,
          guaranteeCents: 765431,
          guaranteeKind: 'MORTGAGE',
          rateType: 'FIXED',
          insuranceMode: 'PERCENT_INITIAL',
        });
        const rows: Record<string, unknown>[] = await dataSource.query(
          `SELECT * FROM debts WHERE id = ?`,
          [secretId],
        );
        const row = rows[0];
        for (const column of [
          'name',
          'principal_cents',
          'remaining_cents',
          'annual_rate_hundredths',
          'monthly_payment_cents',
          'insurance_monthly_cents',
          'lender',
          'contract_reference',
          'initial_term_months',
          'insurance_rate_hundredths',
          'insurance_quotity_percent',
          'fees_cents',
          'guarantee_cents',
          'notes',
        ]) {
          expect({ column, value: row[column] }).toEqual({
            column,
            value: null,
          });
        }
        expect(String(row.secret_payload).startsWith('v1.')).toBe(true);
        // Seuls restent en clair les types (comme `kind`) : taux, mode d'assurance, garantie.
        expect(row).toMatchObject({
          kind: 'MORTGAGE',
          rate_type: 'FIXED',
          insurance_mode: 'PERCENT_INITIAL',
          guarantee_kind: 'MORTGAGE',
        });
        const raw = JSON.stringify(row);
        for (const leaked of [
          'Banque',
          'Dupont',
          'REF-SECRET',
          'confidentielle',
          'chiffré',
          '8765432',
          '7654321',
          '45678',
          '123457',
          '765431',
        ]) {
          expect({ leaked, found: raw.includes(leaked) }).toEqual({
            leaked,
            found: false,
          });
        }
        // Le commun, lui, reste en clair (lecture de l'infrastructure).
        const common_ = await post(
          common,
          full({ lender: 'Banque Commune' }),
        ).expect(201);
        const [commonRow]: Record<string, unknown>[] = await dataSource.query(
          `SELECT lender, contract_reference, initial_term_months, insurance_rate_hundredths, insurance_quotity_percent, fees_cents, guarantee_cents, notes, rate_type, insurance_mode, guarantee_kind FROM debts WHERE id = ?`,
          [common_.body.id],
        );
        expect(commonRow).toEqual({
          lender: 'Banque Commune',
          contract_reference: 'PRET-12345',
          initial_term_months: 240,
          insurance_rate_hundredths: 36,
          insurance_quotity_percent: 200,
          fees_cents: 90000,
          guarantee_cents: 150000,
          notes: 'Remboursement anticipé : 3 % max des sommes remboursées.',
          rate_type: 'FIXED',
          insurance_mode: 'PERCENT_INITIAL',
          guarantee_kind: 'SURETY',
        });
        await remove(common, common_.body.id);
      });

      it('shows the owner every field back, and the summary groups the personal lenders', async () => {
        const mine = (await debtsOf(alice, alicePersonal)).find(
          (d) => d.id === secretId,
        );
        expect(mine).toMatchObject({
          id: secretId,
          lender: 'Banque Secrète Dupont',
          notes: 'note très confidentielle',
        });
        const summary = (
          await alice
            .get(`/api/spaces/${alicePersonal}/debts/summary`)
            .expect(200)
        ).body;
        // Le crédit personnel du test précédent n'a pas de prêteur : groupe '' en plus.
        expect(summary.byLender).toEqual([
          {
            lender: 'Banque Secrète Dupont',
            activeCount: 1,
            remainingCents: 7654321,
            monthlyTotalCents: expect.any(Number),
          },
          {
            lender: '',
            activeCount: 1,
            remainingCents: 555555,
            monthlyTotalCents: 12345 + 987,
          },
        ]);
      });

      it('keeps the other member out (404) and the common space free of the personal lender', async () => {
        const base = `/api/spaces/${alicePersonal}/debts`;
        await bob.get(base).expect(404);
        await bob.get(`${base}/summary`).expect(404);
        await bob.post(base).send(full()).expect(404);
        await bob.put(`${base}/${secretId}`).send(full()).expect(404);
        await bob
          .get(`${base}/${secretId}/what-if?extraMonthlyCents=100`)
          .expect(404);
        expect(JSON.stringify(await debtsOf(bob, common))).not.toContain(
          'Secrète',
        );
        // Agent neuf, sans cookie : anonyme, mais depuis le front (meme origine) pour tester l'authentification.
        const anonymous = request
          .agent(app.getHttpServer())
          .set('Sec-Fetch-Site', 'same-origin');
        await anonymous.get(base).expect(401);
        await remove(alicePersonal, secretId);
      });
    });
  });
});
