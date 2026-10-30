import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { Clock } from '../domain/shared/clock';
import { FakeClock } from '../testing/fake-clock';

type Agent = ReturnType<typeof request.agent>;

describe('Accounts API (tranche 4, end to end, AUTH_MODE=dev, in-memory SQLite)', () => {
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

  async function login(name: 'alice' | 'bob'): Promise<Agent> {
    const agent = request.agent(app.getHttpServer());
    await agent.get(`/api/auth/dev-login?as=${name}`).expect(302);
    return agent;
  }

  const accountBody = (over: Record<string, unknown> = {}) => ({
    name: 'Compte commun',
    kind: 'CHECKING',
    openingBalanceCents: 120000,
    openingDate: '2026-10-01',
    ...over,
  });

  const tx = (accountId: unknown, over = {}) => ({
    kind: 'EXPENSE',
    bloc: 'COURANT',
    label: 'Courses',
    amountCents: 14230,
    date: '2026-11-03T10:00:00.000Z',
    accountId,
    ...over,
  });

  const recurring = (accountId: string | null | undefined, over = {}) => ({
    kind: 'EXPENSE',
    bloc: 'FIXE',
    label: 'Loyer',
    amountCents: 110000,
    dayOfMonth: 20,
    startDate: '2026-01-01',
    endDate: null,
    active: true,
    accountId,
    ...over,
  });

  const accountsOf = async (agent: Agent, space: string) =>
    (await agent.get(`/api/spaces/${space}/accounts`).expect(200)).body as {
      id: string;
      name: string;
      archived: boolean;
      balanceCents: number;
      projectedMonthEndCents: number;
      transactionCount: number;
    }[];

  let commonAccount: string;
  let savings: string;

  describe('CRUD', () => {
    it('requires authentication', async () => {
      const anonymous = request(app.getHttpServer());
      await anonymous.get(`/api/spaces/${common}/accounts`).expect(401);
      await anonymous
        .post(`/api/spaces/${common}/accounts`)
        .send(accountBody())
        .expect(401);
      await anonymous
        .put(`/api/spaces/${common}/accounts/x`)
        .send({})
        .expect(401);
      await anonymous.delete(`/api/spaces/${common}/accounts/x`).expect(401);
    });

    it('creates and lists accounts with the contract shape', async () => {
      expect(await accountsOf(alice, common)).toEqual([]);
      const created = await alice
        .post(`/api/spaces/${common}/accounts`)
        .send(accountBody())
        .expect(201);
      expect(created.body).toEqual({
        id: expect.any(String),
        spaceId: common,
        name: 'Compte commun',
        kind: 'CHECKING',
        openingBalanceCents: 120000,
        openingDate: '2026-10-01',
        archived: false,
        balanceCents: 120000,
        projectedMonthEndCents: 120000,
        transactionCount: 0,
      });
      commonAccount = created.body.id;
      savings = (
        await bob
          .post(`/api/spaces/${common}/accounts`)
          .send(
            accountBody({
              name: 'Livret A',
              kind: 'SAVINGS',
              openingBalanceCents: 500000,
            }),
          )
          .expect(201)
      ).body.id;
      const listed = await accountsOf(bob, common);
      expect(listed.map((a) => a.name)).toEqual(['Compte commun', 'Livret A']);
    });

    it('rejects invalid bodies and duplicate names with a 400', async () => {
      const bad: [string, Record<string, unknown>][] = [
        ['empty name', accountBody({ name: '  ' })],
        ['long name', accountBody({ name: 'x'.repeat(61) })],
        ['duplicate name', accountBody({ name: 'COMPTE COMMUN' })],
        ['unknown kind', accountBody({ kind: 'CRYPTO' })],
        ['fractional balance', accountBody({ openingBalanceCents: 1.5 })],
        ['text balance', accountBody({ openingBalanceCents: 'beaucoup' })],
        ['impossible date', accountBody({ openingDate: '2026-02-30' })],
        ['bad date format', accountBody({ openingDate: '01/10/2026' })],
        ['missing date', accountBody({ openingDate: undefined })],
      ];
      for (const [name, body] of bad) {
        const response = await alice
          .post(`/api/spaces/${common}/accounts`)
          .send(body);
        expect({ name, status: response.status }).toEqual({
          name,
          status: 400,
        });
      }
      const duplicate = await alice
        .post(`/api/spaces/${common}/accounts`)
        .send(accountBody({ name: 'compte commun' }))
        .expect(400);
      expect(duplicate.body.message).toBe(
        'Un compte porte déjà ce nom dans cet espace',
      );
      await alice
        .post(`/api/spaces/${common}/accounts`)
        .send(accountBody({ name: 'x'.repeat(61) }))
        .expect(400)
        .expect((r) =>
          expect(JSON.stringify(r.body.message)).toContain(
            'name est trop long',
          ),
        );
      // Un solde d'ouverture négatif (découvert) est permis.
      const overdraft = await alice
        .post(`/api/spaces/${common}/accounts`)
        .send(accountBody({ name: 'Découvert', openingBalanceCents: -5000 }))
        .expect(201);
      await alice
        .delete(`/api/spaces/${common}/accounts/${overdraft.body.id}`)
        .expect(204);
    });

    it('updates (204), including the archived flag, and answers 404 for unknown ids', async () => {
      await alice
        .put(`/api/spaces/${common}/accounts/${savings}`)
        .send(
          accountBody({
            name: 'Livret A',
            kind: 'SAVINGS',
            openingBalanceCents: 510000,
          }),
        )
        .expect(204);
      let livret = (await accountsOf(alice, common)).find(
        (a) => a.id === savings,
      )!;
      expect(livret).toMatchObject({ balanceCents: 510000, archived: false });
      await alice
        .put(`/api/spaces/${common}/accounts/${savings}`)
        .send(
          accountBody({
            name: 'Livret A',
            kind: 'SAVINGS',
            openingBalanceCents: 510000,
            archived: true,
          }),
        )
        .expect(204);
      const listed = await accountsOf(alice, common);
      // Les comptes archivés viennent en dernier.
      expect(listed.map((a) => a.name)).toEqual(['Compte commun', 'Livret A']);
      livret = listed[1];
      expect(livret.archived).toBe(true);
      await alice
        .put(`/api/spaces/${common}/accounts/${savings}`)
        .send(accountBody({ name: 'Compte commun' }))
        .expect(400);
      await alice
        .put(`/api/spaces/${common}/accounts/${savings}`)
        .send(
          accountBody({
            name: 'Livret A',
            kind: 'SAVINGS',
            openingBalanceCents: 510000,
            archived: false,
          }),
        )
        .expect(204);
      await alice
        .put(`/api/spaces/${common}/accounts/nope`)
        .send(accountBody())
        .expect(404);
      await alice.delete(`/api/spaces/${common}/accounts/nope`).expect(404);
    });
  });

  describe('attaching operations and recurring items', () => {
    it('attaches operations and exposes accountId', async () => {
      const created = await alice
        .post(`/api/spaces/${common}/transactions`)
        .send(tx(commonAccount))
        .expect(201);
      expect(created.body.accountId).toBe(commonAccount);
      await alice
        .post(`/api/spaces/${common}/transactions`)
        .send(
          tx(commonAccount, {
            kind: 'INCOME',
            bloc: undefined,
            label: 'Virements',
            amountCents: 300000,
            date: '2026-11-02T10:00:00.000Z',
          }),
        )
        .expect(201);
      const loose = await alice
        .post(`/api/spaces/${common}/transactions`)
        .send(tx(undefined, { label: 'Boulangerie', amountCents: 500 }))
        .expect(201);
      expect(loose.body.accountId).toBeNull();
      const listed = (
        await alice
          .get(`/api/spaces/${common}/transactions?month=2026-11`)
          .expect(200)
      ).body as { label: string; accountId: string | null }[];
      expect(
        Object.fromEntries(listed.map((t) => [t.label, t.accountId])),
      ).toEqual({
        Courses: commonAccount,
        Virements: commonAccount,
        Boulangerie: null,
      });

      // PUT : déplacer puis détacher.
      await alice
        .put(`/api/spaces/${common}/transactions/${loose.body.id}`)
        .send(tx(savings, { label: 'Boulangerie', amountCents: 500 }))
        .expect(204);
      await alice
        .put(`/api/spaces/${common}/transactions/${loose.body.id}`)
        .send(tx(null, { label: 'Boulangerie', amountCents: 500 }))
        .expect(204);
    });

    it('attaches recurring items and exposes accountId', async () => {
      const rent = await alice
        .post(`/api/spaces/${common}/recurring`)
        .send(recurring(commonAccount))
        .expect(201);
      expect(rent.body.accountId).toBe(commonAccount);
      const list = (
        await alice.get(`/api/spaces/${common}/recurring`).expect(200)
      ).body;
      expect(list[0].accountId).toBe(commonAccount);
      await alice
        .put(`/api/spaces/${common}/recurring/${rent.body.id}`)
        .send(recurring(null))
        .expect(204);
      expect(
        (await alice.get(`/api/spaces/${common}/recurring`).expect(200)).body[0]
          .accountId,
      ).toBeNull();
      await alice
        .put(`/api/spaces/${common}/recurring/${rent.body.id}`)
        .send(recurring(commonAccount))
        .expect(204);
    });

    it('computes balances and the month-end projection', async () => {
      // 120 000 + 300 000 - 14 230 ; le loyer du 20 (110 000) est encore à venir au 12.
      const accounts = await accountsOf(bob, common);
      const main = accounts.find((a) => a.id === commonAccount)!;
      expect(main).toMatchObject({
        balanceCents: 405770,
        projectedMonthEndCents: 295770,
        transactionCount: 2,
      });
      expect(accounts.find((a) => a.id === savings)).toMatchObject({
        balanceCents: 510000,
        projectedMonthEndCents: 510000,
        transactionCount: 0,
      });
      clock.set('2026-11-25T09:00:00Z');
      try {
        // Passé le 20 sans loyer dans les opérations : MISSING, toujours projeté.
        expect(
          (await accountsOf(bob, common)).find((a) => a.id === commonAccount)!
            .projectedMonthEndCents,
        ).toBe(295770);
        // Retrouvé dans les opérations : plus rien à projeter.
        await alice
          .post(`/api/spaces/${common}/transactions`)
          .send(
            tx(commonAccount, {
              label: 'PRLV LOYER NOVEMBRE',
              bloc: 'FIXE',
              amountCents: 110000,
              date: '2026-11-20T10:00:00.000Z',
            }),
          )
          .expect(201);
        expect(
          (await accountsOf(bob, common)).find((a) => a.id === commonAccount)!,
        ).toMatchObject({
          balanceCents: 295770,
          projectedMonthEndCents: 295770,
        });
      } finally {
        clock.set('2026-11-12T09:30:00Z');
      }
    });

    it('refuses an unknown account, one of another space, or an archived one (400)', async () => {
      const personal = (
        await alice
          .post(`/api/spaces/${alicePersonal}/accounts`)
          .send(accountBody({ name: 'Courant Alice' }))
          .expect(201)
      ).body.id as string;
      const archived = (
        await alice
          .post(`/api/spaces/${common}/accounts`)
          .send(accountBody({ name: 'Vieux compte' }))
          .expect(201)
      ).body.id as string;
      await alice
        .put(`/api/spaces/${common}/accounts/${archived}`)
        .send(accountBody({ name: 'Vieux compte', archived: true }))
        .expect(204);

      for (const id of ['nope', personal, archived]) {
        const t = await alice
          .post(`/api/spaces/${common}/transactions`)
          .send(tx(id));
        expect({ id, status: t.status }).toEqual({ id, status: 400 });
        const r = await alice
          .post(`/api/spaces/${common}/recurring`)
          .send(recurring(id));
        expect({ id, status: r.status }).toEqual({ id, status: 400 });
      }
      const wrongSpace = await alice
        .post(`/api/spaces/${alicePersonal}/transactions`)
        .send(tx(commonAccount))
        .expect(400);
      expect(wrongSpace.body.message).toBe(
        "Ce compte n'existe pas dans cet espace",
      );
      const archivedRefusal = await alice
        .post(`/api/spaces/${common}/transactions`)
        .send(tx(archived))
        .expect(400);
      expect(archivedRefusal.body.message).toContain('archivé');
      await alice
        .post(`/api/spaces/${common}/transactions`)
        .send(tx(12345))
        .expect(400);
      await alice
        .delete(`/api/spaces/${common}/accounts/${archived}`)
        .expect(204);
      await alice
        .delete(`/api/spaces/${alicePersonal}/accounts/${personal}`)
        .expect(204);
    });

    it('refuses to delete an account in use, with advice to archive it', async () => {
      const response = await alice
        .delete(`/api/spaces/${common}/accounts/${commonAccount}`)
        .expect(400);
      expect(response.body.message).toContain('archivez-le');
      const temp = (
        await alice
          .post(`/api/spaces/${common}/accounts`)
          .send(accountBody({ name: 'Temporaire' }))
          .expect(201)
      ).body.id as string;
      const rec = (
        await alice
          .post(`/api/spaces/${common}/recurring`)
          .send(recurring(temp, { label: 'Abonnement' }))
          .expect(201)
      ).body.id as string;
      await alice.delete(`/api/spaces/${common}/accounts/${temp}`).expect(400);
      await alice.delete(`/api/spaces/${common}/recurring/${rec}`).expect(204);
      await alice.delete(`/api/spaces/${common}/accounts/${temp}`).expect(204);
    });
  });

  describe('import with accountId', () => {
    const csv = [
      'Date;Libellé;Débit;Crédit',
      '02/11/2026;PRLV ASSURANCE;45,00;',
      '04/11/2026;CB BOULANGERIE;12,40;',
    ].join('\n');
    const items = [
      {
        kind: 'EXPENSE',
        bloc: 'FIXE',
        label: 'PRLV ASSURANCE',
        amountCents: 4500,
        date: '2026-11-02T00:00:00.000Z',
      },
      {
        kind: 'EXPENSE',
        bloc: 'COURANT',
        label: 'CB BOULANGERIE',
        amountCents: 1240,
        date: '2026-11-04T00:00:00.000Z',
      },
    ];

    it('accepts a valid account on preview and refuses an invalid one', async () => {
      const plain = await alice
        .post(`/api/spaces/${common}/imports/preview`)
        .send({ text: csv })
        .expect(200);
      const withAccount = await alice
        .post(`/api/spaces/${common}/imports/preview`)
        .send({ text: csv, accountId: commonAccount })
        .expect(200);
      expect(withAccount.body).toEqual(plain.body);
      await alice
        .post(`/api/spaces/${common}/imports/preview`)
        .send({ text: csv, accountId: 'nope' })
        .expect(400);
      await alice
        .post(`/api/spaces/${common}/imports/preview`)
        .send({ text: csv, accountId: null })
        .expect(200);
    });

    it('attaches every committed row to the account, all or nothing', async () => {
      const before = (await accountsOf(alice, common)).find(
        (a) => a.id === savings,
      )!;
      await alice
        .post(`/api/spaces/${common}/imports/commit`)
        .send({ items, accountId: 'nope' })
        .expect(400);
      expect(
        (await accountsOf(alice, common)).find((a) => a.id === savings)!
          .transactionCount,
      ).toBe(before.transactionCount);

      const commit = await alice
        .post(`/api/spaces/${common}/imports/commit`)
        .send({ items, accountId: savings })
        .expect(201);
      expect(commit.body).toEqual({ created: 2 });
      const listed = (
        await alice
          .get(`/api/spaces/${common}/transactions?month=2026-11`)
          .expect(200)
      ).body as { label: string; accountId: string | null }[];
      expect(
        listed
          .filter((t) => t.accountId === savings)
          .map((t) => t.label)
          .sort(),
      ).toEqual(['CB BOULANGERIE', 'PRLV ASSURANCE']);
      // 510 000 - 4 500 - 1 240
      expect(
        (await accountsOf(alice, common)).find((a) => a.id === savings),
      ).toMatchObject({
        balanceCents: 504260,
        transactionCount: 2,
      });
      // Les doublons restent calculés sur tout l'espace, quel que soit le compte.
      const again = await alice
        .post(`/api/spaces/${common}/imports/preview`)
        .send({ text: csv, accountId: commonAccount })
        .expect(200);
      expect(
        again.body.rows.map((r: { duplicate: boolean }) => r.duplicate),
      ).toEqual([true, true]);
      await alice
        .post(`/api/spaces/${common}/imports/commit`)
        .send({ items })
        .expect(201);
    });
  });

  describe('common space forecast and insights', () => {
    it('assumes the contributions when the common plan has no income', async () => {
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
      const forecast = (
        await bob
          .get(`/api/spaces/${common}/forecast?month=2026-11`)
          .expect(200)
      ).body;
      // Revenu réel 3 000 € < plan 3 400 € : on complète jusqu'au plan.
      expect(forecast.income).toEqual({
        plannedCents: 340000,
        actualCents: 300000,
        expectedRemainingCents: 0,
        projectedCents: 340000,
        contributionAssumed: true,
      });
      const insights = (
        await bob
          .get(`/api/spaces/${common}/insights?month=2026-11`)
          .expect(200)
      ).body.insights as { id: string }[];
      for (const id of [
        'month-deficit',
        'plan-overcommitted',
        'plan-unassigned',
      ]) {
        expect(insights.map((i) => i.id)).not.toContain(id);
      }
    });

    it('keeps an explicit common income untouched and a personal space unaffected', async () => {
      await alice
        .put(`/api/spaces/${alicePersonal}/plan`)
        .send({
          incomeCents: 0,
          fixeCents: 1000,
          courantCents: 0,
          plaisirCents: 0,
          epargneCents: 0,
        })
        .expect(204);
      const personal = (
        await alice
          .get(`/api/spaces/${alicePersonal}/forecast?month=2026-11`)
          .expect(200)
      ).body;
      expect(personal.income).toMatchObject({
        plannedCents: 0,
        projectedCents: 0,
        contributionAssumed: false,
      });
    });

    it('flags accounts projected below zero and operations without account', async () => {
      const poor = (
        await alice
          .post(`/api/spaces/${common}/accounts`)
          .send(
            accountBody({ name: 'Compte à sec', openingBalanceCents: 20000 }),
          )
          .expect(201)
      ).body.id as string;
      await alice
        .post(`/api/spaces/${common}/recurring`)
        .send(
          recurring(poor, {
            label: 'Assurance auto',
            amountCents: 45000,
            dayOfMonth: 28,
          }),
        )
        .expect(201);
      const insights = (
        await alice
          .get(`/api/spaces/${common}/insights?month=2026-11`)
          .expect(200)
      ).body.insights as {
        id: string;
        severity: string;
        title: string;
        detail: string;
        link: string | null;
      }[];
      const negative = insights.find(
        (i) => i.id === 'account-negative-projected',
      )!;
      expect(negative).toMatchObject({
        severity: 'WARNING',
        title: 'Compte à sec passerait sous zéro',
        link: '/comptes',
      });
      expect(negative.detail).toContain('-250');
      const unassigned = insights.find((i) => i.id === 'accounts-unassigned')!;
      expect(unassigned).toMatchObject({ severity: 'INFO', link: '/comptes' });
      expect(unassigned.title).toMatch(/^\d+ opérations? sans compte$/);
      expect(insights.length).toBeLessThanOrEqual(8);
      // Les avertissements passent avant les infos.
      expect(
        insights.findIndex((i) => i.id === 'account-negative-projected'),
      ).toBeLessThan(insights.findIndex((i) => i.id === 'accounts-unassigned'));

      // Un mois sans compte dans l'espace personnel de Bob : aucun des deux conseils.
      const bobs = (
        await bob
          .get(`/api/spaces/${bobPersonal}/insights?month=2026-11`)
          .expect(200)
      ).body.insights as { id: string }[];
      expect(bobs.map((i) => i.id)).not.toEqual(
        expect.arrayContaining(['account-negative-projected']),
      );
      expect(bobs.map((i) => i.id)).not.toContain('accounts-unassigned');
    });
  });

  describe('personal accounts: encryption and isolation', () => {
    let secretAccount: string;

    it('encrypts name and opening balance at rest, and shows them to the owner', async () => {
      const created = await alice
        .post(`/api/spaces/${alicePersonal}/accounts`)
        .send(
          accountBody({
            name: 'Cagnotte cadeaux',
            openingBalanceCents: 777777,
          }),
        )
        .expect(201);
      secretAccount = created.body.id;
      expect(created.body).toMatchObject({
        name: 'Cagnotte cadeaux',
        openingBalanceCents: 777777,
      });

      const raw: Record<string, unknown>[] = await dataSource.query(
        `SELECT * FROM accounts WHERE space_id = ?`,
        [alicePersonal],
      );
      expect(raw).toHaveLength(1);
      expect(raw[0].name).toBeNull();
      expect(raw[0].opening_balance_cents).toBeNull();
      expect(String(raw[0].secret_payload).startsWith('v1.')).toBe(true);
      expect(JSON.stringify(raw)).not.toContain('Cagnotte');
      expect(JSON.stringify(raw)).not.toContain('777777');
      expect(raw[0]).toMatchObject({
        kind: 'CHECKING',
        opening_date: '2026-10-01',
        archived: 0,
      });

      const commonRaw: { name: string }[] = await dataSource.query(
        `SELECT name FROM accounts WHERE space_id = ? ORDER BY name`,
        [common],
      );
      expect(commonRaw[0].name).toBeTruthy();

      // Les opérations rattachées gardent leur libellé et montant chiffrés.
      await alice
        .post(`/api/spaces/${alicePersonal}/transactions`)
        .send(tx(secretAccount, { label: 'Cadeau secret', amountCents: 4200 }))
        .expect(201);
      const txRaw: { account_id: string; label: string | null }[] =
        await dataSource.query(
          `SELECT account_id, label FROM transactions WHERE space_id = ?`,
          [alicePersonal],
        );
      expect(txRaw[0]).toEqual({ account_id: secretAccount, label: null });
      expect((await accountsOf(alice, alicePersonal))[0]).toMatchObject({
        name: 'Cagnotte cadeaux',
        balanceCents: 777777 - 4200,
        transactionCount: 1,
      });
    });

    it('gives the other member a 404 on every account route of a personal space', async () => {
      await bob.get(`/api/spaces/${alicePersonal}/accounts`).expect(404);
      await bob
        .post(`/api/spaces/${alicePersonal}/accounts`)
        .send(accountBody({ name: 'Intrusion' }))
        .expect(404);
      await bob
        .put(`/api/spaces/${alicePersonal}/accounts/${secretAccount}`)
        .send(accountBody({ name: 'Intrusion' }))
        .expect(404);
      await bob
        .delete(`/api/spaces/${alicePersonal}/accounts/${secretAccount}`)
        .expect(404);
      // Passer par un autre espace ne contourne rien.
      await bob
        .put(`/api/spaces/${common}/accounts/${secretAccount}`)
        .send(accountBody({ name: 'Intrusion' }))
        .expect(404);
      await bob
        .delete(`/api/spaces/${common}/accounts/${secretAccount}`)
        .expect(404);
      await bob
        .delete(`/api/spaces/${bobPersonal}/accounts/${secretAccount}`)
        .expect(404);
    });

    it('refuses to use the personal account of another member from any of one’s own spaces', async () => {
      for (const space of [common, bobPersonal]) {
        await bob
          .post(`/api/spaces/${space}/transactions`)
          .send(tx(secretAccount))
          .expect(400);
        await bob
          .post(`/api/spaces/${space}/recurring`)
          .send(recurring(secretAccount))
          .expect(400);
        await bob
          .post(`/api/spaces/${space}/imports/commit`)
          .send({
            items: [
              {
                kind: 'INCOME',
                label: 'X',
                amountCents: 1,
                date: '2026-11-09T00:00:00.000Z',
              },
            ],
            accountId: secretAccount,
          })
          .expect(400);
      }
      await bob
        .post(`/api/spaces/${alicePersonal}/transactions`)
        .send(tx(secretAccount))
        .expect(404);
    });

    it('never leaks personal accounts into the lists of the other member', async () => {
      expect(await accountsOf(bob, bobPersonal)).toEqual([]);
      expect(JSON.stringify(await accountsOf(bob, common))).not.toContain(
        'Cagnotte',
      );
      const own = await accountsOf(alice, alicePersonal);
      expect(own.map((a) => a.name)).toEqual(['Cagnotte cadeaux']);
    });
  });
});
