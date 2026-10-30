import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { Clock } from '../domain/shared/clock';
import { FakeClock } from '../testing/fake-clock';

type Agent = ReturnType<typeof request.agent>;

interface MemberStatus {
  userId: string;
  name: string;
  expectedCents: number | null;
  paidCents: number;
  remainingCents: number | null;
  status: string;
  isMe: boolean;
}

interface Status {
  month: string;
  incomplete: boolean;
  members: MemberStatus[];
  totalExpectedCents: number | null;
  totalPaidCents: number;
}

interface Operation {
  id: string;
  spaceId: string;
  kind: string;
  bloc: string | null;
  label: string;
  amountCents: number;
  date: string;
  accountId: string | null;
  contributionUserId: string | null;
  contributionMonth: string | null;
}

describe('Contribution tracking API (tranche 10, end to end, AUTH_MODE=dev, in-memory SQLite)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  // Jour 12 : au-delà du 6, le conseil `contribution-pending` peut apparaître.
  const clock = FakeClock.at('2026-11-12T09:30:00Z');
  const env = { ...process.env };

  let alice: Agent;
  let bob: Agent;
  let anonymous: Agent;
  const aliceId = 'dev-alice';
  const bobId = 'dev-bob';
  let common: string;
  let alicePersonal: string;
  let bobPersonal: string;
  let aliceCommonAccount: string;
  let alicePersonalAccount: string;
  let bobPersonalAccount: string;

  const PLAN = {
    incomeCents: 0,
    fixeCents: 175000,
    courantCents: 100000,
    plaisirCents: 30000,
    epargneCents: 25000,
  };

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
    anonymous = request.agent(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
    process.env = env;
  });

  const status = async (agent: Agent, month?: string): Promise<Status> =>
    (
      await agent
        .get(
          `/api/household/contributions/status${month ? `?month=${month}` : ''}`,
        )
        .expect(200)
    ).body as Status;

  const member = (s: Status, userId: string): MemberStatus =>
    s.members.find((m) => m.userId === userId)!;

  const pay = (agent: Agent, body: Record<string, unknown>) =>
    agent.post('/api/household/contributions/payments').send(body);

  const operations = async (
    agent: Agent,
    space: string,
    month = '2026-11',
  ): Promise<Operation[]> =>
    (
      await agent
        .get(`/api/spaces/${space}/transactions?month=${month}`)
        .expect(200)
    ).body as Operation[];

  /** Conseils de l'espace commun ; les espaces insécables des montants deviennent des espaces. */
  const insightsOf = async (agent: Agent, month = '2026-11') => {
    const { insights } = (
      await agent
        .get(`/api/spaces/${common}/insights?month=${month}`)
        .expect(200)
    ).body as {
      insights: {
        id: string;
        severity: string;
        title: string;
        detail: string;
        link: string | null;
      }[];
    };
    return insights.map((i) => ({
      ...i,
      title: i.title.replace(/[\u00a0\u202f]/g, ' '),
      detail: i.detail.replace(/[\u00a0\u202f]/g, ' '),
    }));
  };

  const createAccount = async (agent: Agent, space: string, name: string) =>
    (
      await agent
        .post(`/api/spaces/${space}/accounts`)
        .send({
          name,
          kind: 'CHECKING',
          openingBalanceCents: 0,
          openingDate: '2026-01-01',
        })
        .expect(201)
    ).body.id as string;

  it('answers 401 to anonymous callers and 404 to a user without household', async () => {
    await anonymous.get('/api/household/contributions/status').expect(401);
    await anonymous
      .post('/api/household/contributions/payments')
      .send({ month: '2026-11', amountCents: 100 })
      .expect(401);
    await bob.get('/api/household/contributions/status').expect(404);
    await pay(bob, { month: '2026-11', amountCents: 100 }).expect(404);
  });

  it('sets up a couple, a common plan, and a second member with no income yet', async () => {
    const created = await alice
      .post('/api/household')
      .send({ name: 'Famille', netMonthlyIncomeCents: 350000 })
      .expect(201);
    const spaces = created.body.spaces as {
      id: string;
      kind: string;
    }[];
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
    await alice.put(`/api/spaces/${common}/plan`).send(PLAN).expect(204);
    await alice
      .put('/api/household/contribution-mode')
      .send({ mode: 'PROPORTIONAL' })
      .expect(204);

    aliceCommonAccount = await createAccount(alice, common, 'Compte commun');
    alicePersonalAccount = await createAccount(
      alice,
      alicePersonal,
      'Perso Alice',
    );
    bobPersonalAccount = await createAccount(bob, bobPersonal, 'Perso Bob');
  });

  it('is UNKNOWN for everyone, with no advice, while a member has no income', async () => {
    const asAlice = await status(alice, '2026-11');
    expect(asAlice).toEqual({
      month: '2026-11',
      incomplete: true,
      members: [
        {
          userId: aliceId,
          name: 'Alice',
          expectedCents: null,
          paidCents: 0,
          remainingCents: null,
          status: 'UNKNOWN',
          isMe: true,
        },
        {
          userId: bobId,
          name: 'Bob',
          expectedCents: null,
          paidCents: 0,
          remainingCents: null,
          status: 'UNKNOWN',
          isMe: false,
        },
      ],
      totalExpectedCents: null,
      totalPaidCents: 0,
    });
    const ids = (await insightsOf(alice)).map((i) => i.id);
    expect(ids).toContain('contribution-incomplete');
    expect(ids).not.toContain('contribution-pending');
  });

  it('computes the expected amount with the household rule (same as GET /household/contribution)', async () => {
    await bob
      .put('/api/household/me/income')
      .send({ netMonthlyIncomeCents: 200000 })
      .expect(204);
    const rule = (await alice.get('/api/household/contribution').expect(200))
      .body as { shares: { userId: string; contributionCents: number }[] };
    const current = await status(alice);
    expect(current.month).toBe('2026-11');
    expect(current.incomplete).toBe(false);
    expect(current.members.map((m) => [m.userId, m.expectedCents])).toEqual(
      rule.shares.map((s) => [s.userId, s.contributionCents]),
    );
    expect(member(current, aliceId)).toMatchObject({
      expectedCents: 210000,
      paidCents: 0,
      remainingCents: 210000,
      status: 'PENDING',
      isMe: true,
    });
    expect(member(current, bobId)).toMatchObject({
      expectedCents: 120000,
      status: 'PENDING',
      isMe: false,
    });
    expect(current.totalExpectedCents).toBe(330000);
    expect(current.totalPaidCents).toBe(0);
    // Même lecture pour l'autre membre, avec isMe inversé.
    const asBob = await status(bob);
    expect(member(asBob, bobId).isMe).toBe(true);
    expect(member(asBob, aliceId).isMe).toBe(false);
  });

  it('flags only MY pending contribution, from the 6th, never the others', async () => {
    const aliceInsight = (await insightsOf(alice)).find(
      (i) => i.id === 'contribution-pending',
    )!;
    expect(aliceInsight).toMatchObject({
      severity: 'ACTION',
      link: '/foyer',
    });
    expect(aliceInsight.title).toContain('2 100');
    const bobInsight = (await insightsOf(bob)).find(
      (i) => i.id === 'contribution-pending',
    )!;
    expect(bobInsight.title).toContain('1 200');
    // Rien sur l'autre membre : aucun montant ni prénom de l'autre dans mon conseil.
    expect(JSON.stringify(aliceInsight)).not.toContain('1 200');
    expect(JSON.stringify(aliceInsight)).not.toContain('Bob');
    expect(JSON.stringify(bobInsight)).not.toContain('2 100');
    expect(JSON.stringify(bobInsight)).not.toContain('Alice');

    // Pas pour un autre mois que le mois courant, ni pour un espace personnel.
    for (const month of ['2026-10', '2026-12']) {
      expect((await insightsOf(alice, month)).map((i) => i.id)).not.toContain(
        'contribution-pending',
      );
    }
    const personal = (
      await alice
        .get(`/api/spaces/${alicePersonal}/insights?month=2026-11`)
        .expect(200)
    ).body.insights as { id: string }[];
    expect(personal.map((i) => i.id)).not.toContain('contribution-pending');

    // Avant le 6 du mois : aucun conseil.
    clock.set('2026-11-05T10:00:00Z');
    expect((await insightsOf(alice)).map((i) => i.id)).not.toContain(
      'contribution-pending',
    );
    clock.set('2026-11-12T09:30:00Z');
  });

  it('records a payment without debiting the personal space', async () => {
    const response = await pay(alice, {
      month: '2026-11',
      amountCents: 120000,
      date: '2026-11-03',
      accountId: aliceCommonAccount,
    }).expect(201);
    expect(response.body).toEqual({
      transactionId: expect.any(String),
      personalTransactionId: null,
    });

    const list = await operations(alice, common);
    expect(list).toEqual([
      {
        id: response.body.transactionId,
        spaceId: common,
        kind: 'INCOME',
        bloc: null,
        label: 'Contribution de Alice',
        amountCents: 120000,
        date: '2026-11-03T00:00:00.000Z',
        accountId: aliceCommonAccount,
        contributionUserId: aliceId,
        contributionMonth: '2026-11',
      },
    ]);
    expect(await operations(alice, alicePersonal)).toEqual([]);

    const after = await status(bob);
    expect(member(after, aliceId)).toMatchObject({
      expectedCents: 210000,
      paidCents: 120000,
      remainingCents: 90000,
      status: 'PARTIAL',
    });
    expect(member(after, bobId)).toMatchObject({
      paidCents: 0,
      status: 'PENDING',
    });
    expect(after.totalPaidCents).toBe(120000);

    const partial = (await insightsOf(alice)).find(
      (i) => i.id === 'contribution-pending',
    )!;
    expect(partial.title).toContain('900');
    expect(partial.detail).toContain('1 200');
  });

  it('records a payment and the personal expense, encrypted and unreachable for the other member', async () => {
    const response = await pay(bob, {
      month: '2026-11',
      amountCents: 120000,
      date: '2026-11-04T08:00:00.000Z',
      debitPersonal: true,
      personalAccountId: bobPersonalAccount,
      personalBloc: 'FIXE',
    }).expect(201);
    const { transactionId, personalTransactionId } = response.body as {
      transactionId: string;
      personalTransactionId: string;
    };
    expect(personalTransactionId).toEqual(expect.any(String));
    expect(personalTransactionId).not.toBe(transactionId);

    // Bob voit sa dépense perso, déchiffrée, et le revenu côté commun.
    const mine = await operations(bob, bobPersonal);
    expect(mine).toEqual([
      {
        id: personalTransactionId,
        spaceId: bobPersonal,
        kind: 'EXPENSE',
        bloc: 'FIXE',
        label: 'Contribution au foyer',
        amountCents: 120000,
        date: '2026-11-04T08:00:00.000Z',
        accountId: bobPersonalAccount,
        contributionUserId: null,
        contributionMonth: null,
      },
    ]);
    const income = (await operations(bob, common)).find(
      (o) => o.id === transactionId,
    )!;
    expect(income).toMatchObject({
      label: 'Contribution de Bob',
      kind: 'INCOME',
      amountCents: 120000,
      date: '2026-11-04T08:00:00.000Z',
      accountId: null,
      contributionUserId: bobId,
      contributionMonth: '2026-11',
    });

    // En base : chiffrée, sans lien entre les deux lignes.
    const personalRow: Record<string, unknown>[] = await dataSource.query(
      `SELECT * FROM transactions WHERE id = ?`,
      [personalTransactionId],
    );
    expect(personalRow).toHaveLength(1);
    expect(personalRow[0].label).toBeNull();
    expect(personalRow[0].amount_cents).toBeNull();
    expect(String(personalRow[0].secret_payload).startsWith('v1.')).toBe(true);
    expect(JSON.stringify(personalRow)).not.toContain('Contribution au foyer');
    expect(personalRow[0].contribution_user_id).toBeNull();
    expect(personalRow[0].contribution_month).toBeNull();
    const commonRow: Record<string, unknown>[] = await dataSource.query(
      `SELECT * FROM transactions WHERE id = ?`,
      [transactionId],
    );
    expect(JSON.stringify(commonRow)).not.toContain(personalTransactionId);
    expect(JSON.stringify(commonRow)).not.toContain(bobPersonalAccount);
    expect(JSON.stringify(commonRow)).not.toContain(bobPersonal);

    // Alice : ni la dépense perso de Bob, ni son espace, ni son compte.
    await alice
      .get(`/api/spaces/${bobPersonal}/transactions?month=2026-11`)
      .expect(404);
    await alice.get(`/api/spaces/${bobPersonal}/accounts`).expect(404);
    const visibleToAlice = JSON.stringify([
      await operations(alice, common),
      await operations(alice, alicePersonal),
      await status(alice),
      (await alice.get('/api/household').expect(200)).body,
      await insightsOf(alice),
    ]);
    expect(visibleToAlice).not.toContain(personalTransactionId);
    expect(visibleToAlice).not.toContain(bobPersonalAccount);
    expect(visibleToAlice).not.toContain('Contribution au foyer');
    // Et la dépense perso de Bob ne se laisse pas modifier ni supprimer par Alice.
    await alice
      .delete(
        `/api/spaces/${bobPersonal}/transactions/${personalTransactionId}`,
      )
      .expect(404);

    expect(member(await status(alice), bobId)).toMatchObject({
      paidCents: 120000,
      remainingCents: 0,
      status: 'PAID',
    });
    // Bob a soldé : plus de conseil pour lui, Alice garde le sien.
    expect((await insightsOf(bob)).map((i) => i.id)).not.toContain(
      'contribution-pending',
    );
    expect((await insightsOf(alice)).map((i) => i.id)).toContain(
      'contribution-pending',
    );
  });

  it('records the personal expense in the author space, with the chosen bloc, defaulting to FIXE', async () => {
    const response = await pay(alice, {
      month: '2026-11',
      amountCents: 90000,
      debitPersonal: true,
      personalAccountId: alicePersonalAccount,
      personalBloc: 'EPARGNE',
    }).expect(201);
    const [expense] = await operations(alice, alicePersonal);
    expect(expense).toMatchObject({
      id: response.body.personalTransactionId,
      bloc: 'EPARGNE',
      amountCents: 90000,
      date: '2026-11-12T09:30:00.000Z',
    });

    const defaulted = await pay(alice, {
      month: '2026-12',
      amountCents: 100,
      debitPersonal: true,
    }).expect(201);
    const found = (await operations(alice, alicePersonal)).find(
      (o) => o.id === defaulted.body.personalTransactionId,
    )!;
    expect(found.bloc).toBe('FIXE');
    expect(found.accountId).toBeNull();
    // Le mois couvert (décembre) ne compte pas dans la contribution de novembre.
    expect(member(await status(alice, '2026-11'), aliceId)).toMatchObject({
      paidCents: 210000,
      status: 'PAID',
    });
    expect(member(await status(alice, '2026-12'), aliceId).paidCents).toBe(100);
  });

  it('covers PAID, OVERPAID (> expected + 1 €) and NONE', async () => {
    const paid = await status(alice, '2026-11');
    expect(member(paid, aliceId).status).toBe('PAID');
    await pay(alice, { month: '2026-11', amountCents: 100 }).expect(201);
    expect(member(await status(alice, '2026-11'), aliceId).status).toBe('PAID'); // 1 € de plus : toléré
    await pay(alice, { month: '2026-11', amountCents: 1 }).expect(201);
    expect(member(await status(alice, '2026-11'), aliceId)).toMatchObject({
      paidCents: 210101,
      remainingCents: 0,
      status: 'OVERPAID',
    });
    expect((await insightsOf(alice)).map((i) => i.id)).not.toContain(
      'contribution-pending',
    );

    await alice
      .put(`/api/spaces/${common}/plan`)
      .send({
        incomeCents: 0,
        fixeCents: 0,
        courantCents: 0,
        plaisirCents: 0,
        epargneCents: 0,
      })
      .expect(204);
    const none = await status(bob, '2026-11');
    expect(none.members.map((m) => [m.expectedCents, m.status])).toEqual([
      [0, 'NONE'],
      [0, 'NONE'],
    ]);
    await alice.put(`/api/spaces/${common}/plan`).send(PLAN).expect(204);
  });

  it('ignores contributionUserId and contributionMonth on the ordinary create route, and exposes null on other operations', async () => {
    const created = await alice
      .post(`/api/spaces/${common}/transactions`)
      .send({
        kind: 'INCOME',
        label: 'Prime',
        amountCents: 5000,
        date: '2026-11-08T10:00:00.000Z',
        contributionUserId: aliceId,
        contributionMonth: '2026-11',
      })
      .expect(201);
    expect(created.body).toMatchObject({
      label: 'Prime',
      contributionUserId: null,
      contributionMonth: null,
    });
    const listed = (await operations(alice, common)).find(
      (o) => o.id === created.body.id,
    )!;
    expect(listed.contributionUserId).toBeNull();
    expect(listed.contributionMonth).toBeNull();
    expect(member(await status(alice, '2026-11'), aliceId).paidCents).toBe(
      210101,
    );
    const personal = await alice
      .post(`/api/spaces/${alicePersonal}/transactions`)
      .send({
        kind: 'EXPENSE',
        bloc: 'COURANT',
        label: 'Courses',
        amountCents: 1000,
        contributionUserId: aliceId,
        contributionMonth: '2026-11',
      })
      .expect(201);
    expect(personal.body.contributionUserId).toBeNull();
    expect(personal.body.contributionMonth).toBeNull();
  });

  it('lets a contribution be edited or deleted through the ordinary routes, and recomputes the status', async () => {
    const result = await pay(bob, {
      month: '2026-10',
      amountCents: 50000,
    }).expect(201);
    const id = result.body.transactionId as string;
    expect(member(await status(bob, '2026-10'), bobId)).toMatchObject({
      paidCents: 50000,
      status: 'PARTIAL',
    });

    await bob
      .put(`/api/spaces/${common}/transactions/${id}`)
      .send({
        kind: 'INCOME',
        label: 'Contribution de Bob',
        amountCents: 120000,
        date: '2026-10-05T10:00:00.000Z',
      })
      .expect(204);
    const edited = (await operations(bob, common, '2026-10')).find(
      (o) => o.id === id,
    )!;
    expect(edited).toMatchObject({
      amountCents: 120000,
      contributionUserId: bobId,
      contributionMonth: '2026-10',
    });
    expect(member(await status(bob, '2026-10'), bobId)).toMatchObject({
      paidCents: 120000,
      status: 'PAID',
    });

    await bob.delete(`/api/spaces/${common}/transactions/${id}`).expect(204);
    expect(member(await status(bob, '2026-10'), bobId)).toMatchObject({
      paidCents: 0,
      status: 'PENDING',
    });
  });

  it('rejects invalid payments with a 400 in French, and creates nothing', async () => {
    const before = await dataSource.query(
      `SELECT COUNT(*) AS n FROM transactions`,
    );
    const invalid: [string, Record<string, unknown>][] = [
      ['amount 0', { month: '2026-11', amountCents: 0 }],
      ['negative amount', { month: '2026-11', amountCents: -500 }],
      ['non-integer amount', { month: '2026-11', amountCents: 10.5 }],
      ['missing amount', { month: '2026-11' }],
      ['missing month', { amountCents: 100 }],
      ['malformed month', { month: '2026-13', amountCents: 100 }],
      ['month too far ahead', { month: '2027-01', amountCents: 100 }],
      ['bad date', { month: '2026-11', amountCents: 100, date: 'demain' }],
      [
        'unknown bloc',
        {
          month: '2026-11',
          amountCents: 100,
          debitPersonal: true,
          personalBloc: 'LOISIRS',
        },
      ],
      [
        'personal account without debitPersonal',
        { month: '2026-11', amountCents: 100, personalAccountId: 'x' },
      ],
      [
        'personal account with debitPersonal false',
        {
          month: '2026-11',
          amountCents: 100,
          debitPersonal: false,
          personalAccountId: alicePersonalAccount,
        },
      ],
      [
        'unknown account',
        { month: '2026-11', amountCents: 100, accountId: 'ghost' },
      ],
      [
        'personal account used as common account',
        { month: '2026-11', amountCents: 100, accountId: alicePersonalAccount },
      ],
      [
        'common account used as personal account',
        {
          month: '2026-11',
          amountCents: 100,
          debitPersonal: true,
          personalAccountId: aliceCommonAccount,
        },
      ],
      [
        'personal account of the other member',
        {
          month: '2026-11',
          amountCents: 100,
          debitPersonal: true,
          personalAccountId: bobPersonalAccount,
        },
      ],
    ];
    for (const [label, body] of invalid) {
      const response = await pay(alice, body);
      expect([label, response.status]).toEqual([label, 400]);
    }
    expect(
      (await pay(alice, { month: '2027-01', amountCents: 100 })).body.message,
    ).toMatch(/mois/);
    await alice
      .get('/api/household/contributions/status?month=2026-13')
      .expect(400);
    await alice
      .get('/api/household/contributions/status?month=nov')
      .expect(400);
    expect(
      await dataSource.query(`SELECT COUNT(*) AS n FROM transactions`),
    ).toEqual(before);

    // Un compte archivé n'accepte plus de versement (commun comme personnel).
    const archived = await createAccount(alice, common, 'Ancien compte');
    await alice
      .put(`/api/spaces/${common}/accounts/${archived}`)
      .send({
        name: 'Ancien compte',
        kind: 'CHECKING',
        openingBalanceCents: 0,
        openingDate: '2026-01-01',
        archived: true,
      })
      .expect(204);
    await pay(alice, {
      month: '2026-11',
      amountCents: 100,
      accountId: archived,
    }).expect(400);
    const archivedPersonal = await createAccount(
      alice,
      alicePersonal,
      'Ancien perso',
    );
    await alice
      .put(`/api/spaces/${alicePersonal}/accounts/${archivedPersonal}`)
      .send({
        name: 'Ancien perso',
        kind: 'CHECKING',
        openingBalanceCents: 0,
        openingDate: '2026-01-01',
        archived: true,
      })
      .expect(204);
    await pay(alice, {
      month: '2026-11',
      amountCents: 100,
      debitPersonal: true,
      personalAccountId: archivedPersonal,
    }).expect(400);
    expect(
      await dataSource.query(`SELECT COUNT(*) AS n FROM transactions`),
    ).toEqual(before);
  });

  it('creates both operations or none: a failure on the second leaves no trace of the first', async () => {
    const count = async (): Promise<number> => {
      const rows: { n: number }[] = await dataSource.query(
        `SELECT COUNT(*) AS n FROM transactions`,
      );
      return rows[0].n;
    };
    const before = await count();

    // La 2e écriture (dépense de l'espace personnel d'Alice) échoue en base.
    await dataSource.query(
      `CREATE TRIGGER fail_second_write BEFORE INSERT ON transactions WHEN NEW.kind = 'EXPENSE' AND NEW.space_id = '${alicePersonal}' BEGIN SELECT RAISE(ABORT, 'échec simulé'); END`,
    );
    try {
      await pay(alice, {
        month: '2026-12',
        amountCents: 777,
        debitPersonal: true,
      }).expect(500);
    } finally {
      await dataSource.query(`DROP TRIGGER fail_second_write`);
    }
    expect(await count()).toBe(before);
    expect(member(await status(alice, '2026-12'), aliceId).paidCents).toBe(100);
    expect(
      (await operations(alice, common, '2026-11')).some(
        (o) => o.amountCents === 777,
      ),
    ).toBe(false);

    // Sans panne, le même versement passe et crée bien les deux opérations.
    await pay(alice, {
      month: '2026-12',
      amountCents: 777,
      debitPersonal: true,
    }).expect(201);
    expect(await count()).toBe(before + 2);
  });
});
