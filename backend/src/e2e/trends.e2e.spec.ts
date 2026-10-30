import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { Clock } from '../domain/shared/clock';
import { FakeClock } from '../testing/fake-clock';

type Agent = ReturnType<typeof request.agent>;

const NBSP = ' ';
const MONTHS = [
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
  '2026-10',
];

describe('Trends API (tranche 9, end to end, AUTH_MODE=dev, in-memory SQLite)', () => {
  let app: NestExpressApplication;
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

  const post = (space: string, body: Record<string, unknown>) =>
    alice.post(`/api/spaces/${space}/transactions`).send(body).expect(201);
  const expense = (
    space: string,
    bloc: string,
    label: string,
    amountCents: number,
    date: string,
  ) =>
    post(space, {
      kind: 'EXPENSE',
      bloc,
      label,
      amountCents,
      date: `${date}T10:00:00.000Z`,
    });
  const trends = (agent: Agent, space: string, query = '') =>
    agent.get(`/api/spaces/${space}/trends${query}`);

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .get(`/api/spaces/${common}/trends`)
      .expect(401);
  });

  it('returns a window of empty months at zero for a space without operations', async () => {
    const response = await trends(alice, common).expect(200);
    expect(response.body.from).toBe('2026-05');
    expect(response.body.to).toBe('2026-10');
    expect(response.body.months).toHaveLength(6);
    expect(response.body.months[0]).toEqual({
      month: '2026-05',
      incomeCents: 0,
      expenseCents: 0,
      balanceCents: 0,
      savingsRatePercent: 0,
      blocs: { FIXE: 0, COURANT: 0, PLAISIR: 0, EPARGNE: 0 },
    });
    expect(response.body.averages).toEqual({
      incomeCents: 0,
      expenseCents: 0,
      savingsRatePercent: 0,
    });
    expect(response.body.topLabels).toEqual([]);
    expect(response.body.risers).toEqual([]);
  });

  describe('with six months of operations', () => {
    beforeAll(async () => {
      for (const month of ['2026-09', '2026-10']) {
        await post(common, {
          kind: 'INCOME',
          label: 'Salaire',
          amountCents: 380000,
          date: `${month}-28T10:00:00.000Z`,
        });
      }
      for (const [i, month] of MONTHS.entries()) {
        await expense(common, 'FIXE', 'Loyer', 110000, `${month}-03`);
        await expense(
          common,
          'PLAISIR',
          'Restaurant',
          i < 3 ? 4000 : 9000,
          `${month}-12`,
        );
        await expense(
          common,
          'EPARGNE',
          'Virement livret',
          30000,
          `${month}-20`,
        );
      }
      await expense(common, 'COURANT', 'CB CARREFOUR 12', 5000, '2026-10-04');
      await expense(common, 'COURANT', 'CB CARREFOUR 34', 7000, '2026-10-18');
      // Hors fenêtre par défaut : avril 2026.
      await expense(common, 'COURANT', 'Vieux poste', 77777, '2026-04-15');
    });

    it('answers with the contract shape, grouping labels and keeping EPARGNE out of topLabels and risers', async () => {
      const { body } = await trends(bob, common).expect(200);
      expect(body.months[5]).toEqual({
        month: '2026-10',
        incomeCents: 380000,
        // 110 000 + 9 000 + 12 000 + 30 000 d'épargne (comptée dans les dépenses et les blocs)
        expenseCents: 161000,
        balanceCents: 219000,
        savingsRatePercent: 58, // 57,63
        blocs: { FIXE: 110000, COURANT: 12000, PLAISIR: 9000, EPARGNE: 30000 },
      });
      expect(body.months[0]).toMatchObject({
        month: '2026-05',
        incomeCents: 0,
        expenseCents: 144000,
        balanceCents: -144000,
        savingsRatePercent: 0,
      });
      expect(body.averages).toEqual({
        incomeCents: 126666, // 760 000 / 6, arrondi inférieur
        expenseCents: 148500, // 891 000 / 6
        savingsRatePercent: -17, // (760 000 − 891 000) / 760 000
      });
      expect(body.topLabels).toEqual([
        {
          label: 'Loyer',
          totalCents: 660000,
          monthlyAverageCents: 110000,
          trendPercent: 0,
        },
        {
          label: 'Restaurant',
          totalCents: 39000,
          monthlyAverageCents: 6500,
          trendPercent: 125,
        },
        // « CB CARREFOUR 12 » et « 34 » forment un groupe ; à égalité, le libellé le plus récent.
        {
          label: 'CB CARREFOUR 34',
          totalCents: 12000,
          monthlyAverageCents: 2000,
          trendPercent: null,
        },
      ]);
      expect(body.risers).toEqual([
        {
          label: 'Restaurant',
          recentAverageCents: 9000,
          previousAverageCents: 4000,
          deltaCents: 5000,
        },
        {
          label: 'CB CARREFOUR 34',
          recentAverageCents: 4000,
          previousAverageCents: 0,
          deltaCents: 4000,
        },
      ]);
      const text = JSON.stringify([body.topLabels, body.risers]);
      expect(text).not.toContain('livret');
      expect(text).not.toContain('Vieux poste');
      expect(text).not.toContain('Salaire');
    });

    it('honours months and to', async () => {
      const three = (await trends(alice, common, '?months=3').expect(200)).body;
      expect(three.from).toBe('2026-08');
      expect(three.risers).toEqual([]); // moins de 4 mois
      // 3 mois : le mois du milieu (septembre) est ignoré pour trendPercent.
      expect(
        three.topLabels.find((l: { label: string }) => l.label === 'Restaurant')
          .trendPercent,
      ).toBe(0);
      const past = (
        await trends(alice, common, '?months=4&to=2026-07').expect(200)
      ).body;
      expect(past).toMatchObject({ from: '2026-04', to: '2026-07' });
      expect(past.months.map((m: { month: string }) => m.month)).toEqual([
        '2026-04',
        '2026-05',
        '2026-06',
        '2026-07',
      ]);
      expect(past.months[0].expenseCents).toBe(77777);
      expect(past.topLabels.map((l: { label: string }) => l.label)).toContain(
        'Vieux poste',
      );
      const wide = (
        await trends(alice, common, '?months=24&to=2026-10').expect(200)
      ).body;
      expect(wide.months).toHaveLength(24);
      expect(wide.from).toBe('2024-11');
      const future = (
        await trends(alice, common, '?months=3&to=2027-01').expect(200)
      ).body;
      expect(
        future.months.map((m: { expenseCents: number }) => m.expenseCents),
      ).toEqual([0, 0, 0]);
    });

    it('answers 400 for invalid parameters', async () => {
      for (const query of [
        '?months=2',
        '?months=25',
        '?months=abc',
        '?months=3.5',
        '?months=0',
        '?to=2026-13',
        '?to=octobre',
        '?to=2026-1',
        '?to=2026-10-01',
        '?months=3&to=2000-02',
        '?months=24&to=2001-11',
      ]) {
        const response = await trends(alice, common, query);
        expect({ query, status: response.status }).toEqual({
          query,
          status: 400,
        });
      }
      const window = await trends(alice, common, '?months=3&to=2000-02').expect(
        400,
      );
      expect(window.body.message).toContain('avant 2000');
      expect(
        JSON.stringify(
          (await trends(alice, common, '?months=2').expect(400)).body.message,
        ),
      ).toContain('months doit être compris entre 3 et 24');
      await trends(alice, common, '?months=3&to=2000-03').expect(200);
      await trends(alice, common, '?months=24&to=2001-12').expect(200);
    });

    it('feeds the spending-riser insight for the current month only', async () => {
      const insights = (
        await alice
          .get(`/api/spaces/${common}/insights?month=2026-10`)
          .expect(200)
      ).body.insights as {
        id: string;
        severity: string;
        title: string;
        detail: string;
        link: string;
      }[];
      const riser = insights.find((i) => i.id === 'spending-riser')!;
      expect(riser).toMatchObject({
        severity: 'INFO',
        title: 'Dépense en hausse : Restaurant',
        link: '/tendances',
      });
      expect(riser.detail).toContain(`passe de 40${NBSP}€ à 90${NBSP}€`);
      expect(insights.filter((i) => i.id === 'spending-riser')).toHaveLength(1);
      for (const month of ['2026-09', '2026-11']) {
        const other = (
          await alice
            .get(`/api/spaces/${common}/insights?month=${month}`)
            .expect(200)
        ).body.insights as { id: string }[];
        expect(other.map((i) => i.id)).not.toContain('spending-riser');
      }
    });
  });

  describe('young spaces', () => {
    const risers = async () =>
      (
        (
          await alice
            .get(`/api/spaces/${alicePersonal}/insights?month=2026-10`)
            .expect(200)
        ).body.insights as { id: string; title: string }[]
      ).filter((i) => i.id === 'spending-riser');

    it('does not raise spending-riser with fewer than 4 months of data, then does with 4', async () => {
      for (const [month, cents] of [
        ['2026-08', 1000],
        ['2026-09', 90000],
        ['2026-10', 90000],
      ] as const) {
        await expense(
          alicePersonal,
          'PLAISIR',
          'Gros poste',
          cents,
          `${month}-10`,
        );
      }
      // 3 mois de données : la moitié ancienne serait vide, aucun conseil.
      expect(await risers()).toEqual([]);
      await expense(alicePersonal, 'PLAISIR', 'Gros poste', 1000, '2026-07-10');
      // 4 mois (juillet-octobre) : juillet-août contre septembre-octobre.
      expect(await risers()).toEqual([
        expect.objectContaining({ title: 'Dépense en hausse : Gros poste' }),
      ]);
      const own = (await trends(alice, alicePersonal, '?months=4').expect(200))
        .body;
      expect(own.risers).toEqual([
        {
          label: 'Gros poste',
          recentAverageCents: 90000,
          previousAverageCents: 1000,
          deltaCents: 89000,
        },
      ]);
    });
  });

  describe('isolation', () => {
    it('never exposes the labels of a personal space to another member', async () => {
      await expense(
        alicePersonal,
        'PLAISIR',
        'Cadeau secret',
        4200,
        '2026-10-12',
      );
      await trends(bob, alicePersonal).expect(404);
      await trends(bob, alicePersonal, '?months=12&to=2026-10').expect(404);
      const mine = (await trends(alice, alicePersonal).expect(200)).body;
      expect(mine.topLabels).toContainEqual(
        expect.objectContaining({ label: 'Cadeau secret', totalCents: 4200 }),
      );
      const shared = JSON.stringify(
        (await trends(bob, common).expect(200)).body,
      );
      expect(shared).not.toContain('Cadeau secret');
      const bobs = (await trends(bob, bobPersonal).expect(200)).body;
      expect(bobs.topLabels).toEqual([]);
      // Le conseil (libellé « Gros poste ») n'existe que pour le propriétaire.
      await bob
        .get(`/api/spaces/${alicePersonal}/insights?month=2026-10`)
        .expect(404);
      const sharedInsights = (
        await bob
          .get(`/api/spaces/${common}/insights?month=2026-10`)
          .expect(200)
      ).body;
      expect(JSON.stringify(sharedInsights)).not.toContain('Gros poste');
    });
  });
});
