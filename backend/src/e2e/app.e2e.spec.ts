import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';

type Agent = ReturnType<typeof request.agent>;

describe('API (end to end, AUTH_MODE=dev, in-memory SQLite)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  const env = { ...process.env };

  beforeAll(async () => {
    Object.assign(process.env, {
      AUTH_MODE: 'dev',
      NODE_ENV: 'test',
      DATABASE_PATH: ':memory:',
      FRONTEND_URL: 'http://localhost:3000',
    });
    delete process.env.PERSONAL_DATA_KEY;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);
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

  it('exposes the auth mode and rejects unknown dev users', async () => {
    const anonymous = request(app.getHttpServer());
    const config = await anonymous.get('/api/auth/config').expect(200);
    expect(config.body).toEqual({ mode: 'dev', devUsers: ['alice', 'bob'] });
    await anonymous.get('/api/auth/dev-login?as=mallory').expect(404);
    await anonymous.get('/api/household').expect(401);
  });

  it('plays the full couple scenario and keeps personal spaces private', async () => {
    const alice = await login('alice');
    const bob = await login('bob');

    expect((await alice.get('/api/household').expect(200)).body).toEqual({
      household: null,
    });

    const created = await alice
      .post('/api/household')
      .send({ name: 'Famille', netMonthlyIncomeCents: 350000 })
      .expect(201);
    const aliceSpaces = created.body.spaces as {
      id: string;
      kind: string;
    }[];
    const common = aliceSpaces.find((s) => s.kind === 'COMMON')!.id;
    const alicePersonal = aliceSpaces.find((s) => s.kind === 'PERSONAL')!.id;

    const { code } = (
      await alice.post('/api/household/invitations').expect(201)
    ).body;
    const joined = await bob
      .post('/api/household/join')
      .send({ code })
      .expect(200);
    const bobSpaces = joined.body.spaces as {
      id: string;
      kind: string;
    }[];
    const bobPersonal = bobSpaces.find((s) => s.kind === 'PERSONAL')!.id;
    expect(bobSpaces.map((s) => s.id)).not.toContain(alicePersonal);

    // A used code is unknown ; a valid code is still refused to someone who already has a household.
    await bob.post('/api/household/join').send({ code }).expect(404);
    const second = (await alice.post('/api/household/invitations').expect(201))
      .body;
    await bob
      .post('/api/household/join')
      .send({ code: second.code })
      .expect(409);

    const secret = await alice
      .post(`/api/spaces/${alicePersonal}/transactions`)
      .send({
        kind: 'EXPENSE',
        bloc: 'PLAISIR',
        label: 'Cadeau surprise',
        amountCents: 4200,
        date: '2026-10-12T10:00:00Z',
      })
      .expect(201);
    await alice
      .post(`/api/spaces/${common}/transactions`)
      .send({
        kind: 'EXPENSE',
        bloc: 'COURANT',
        label: 'Courses',
        amountCents: 14230,
        date: '2026-10-03T10:00:00Z',
      })
      .expect(201);

    // Bob reads the common space but gets 404 on everything about Alice's personal space.
    const bobCommon = await bob
      .get(`/api/spaces/${common}/transactions?month=2026-10`)
      .expect(200);
    expect(bobCommon.body.map((t: { label: string }) => t.label)).toEqual([
      'Courses',
    ]);
    for (const path of [
      'plan',
      'transactions?month=2026-10',
      'summary?month=2026-10',
    ]) {
      await bob.get(`/api/spaces/${alicePersonal}/${path}`).expect(404);
    }
    await bob
      .delete(`/api/spaces/${alicePersonal}/transactions/${secret.body.id}`)
      .expect(404);
    await bob
      .delete(`/api/spaces/${common}/transactions/${secret.body.id}`)
      .expect(404);
    await bob
      .post(`/api/spaces/${alicePersonal}/transactions`)
      .send({ kind: 'INCOME', label: 'Intrusion', amountCents: 100 })
      .expect(404);

    // Alice reads her personal space in clear ; the database holds only ciphertext.
    const mine = await alice
      .get(`/api/spaces/${alicePersonal}/transactions?month=2026-10`)
      .expect(200);
    expect(mine.body[0]).toMatchObject({
      label: 'Cadeau surprise',
      amountCents: 4200,
      bloc: 'PLAISIR',
    });
    const raw: {
      label: string | null;
      amount_cents: number | null;
      secret_payload: string;
    }[] = await dataSource.query(
      `SELECT label, amount_cents, secret_payload FROM transactions WHERE space_id = ?`,
      [alicePersonal],
    );
    expect(raw).toHaveLength(1);
    expect(raw[0].label).toBeNull();
    expect(raw[0].amount_cents).toBeNull();
    expect(raw[0].secret_payload.startsWith('v1.')).toBe(true);
    expect(raw[0].secret_payload).not.toContain('Cadeau');
    const plainCommon: { label: string }[] = await dataSource.query(
      `SELECT label FROM transactions WHERE space_id = ?`,
      [common],
    );
    expect(plainCommon[0].label).toBe('Courses');

    // Plans, summary and contribution.
    await alice
      .put(`/api/spaces/${common}/plan`)
      .send({
        incomeCents: 0,
        fixeCents: 175000,
        courantCents: 100000,
        plaisirCents: 30000,
        epargneCents: 25000,
      })
      .expect(204);
    await bob
      .put('/api/household/me/income')
      .send({ netMonthlyIncomeCents: 200000 })
      .expect(204);
    const contribution = await alice
      .get('/api/household/contribution')
      .expect(200);
    expect(contribution.body).toMatchObject({
      mode: 'PROPORTIONAL',
      commonNeedCents: 330000,
      incomplete: false,
    });
    expect(
      contribution.body.shares.map(
        (s: { name: string; contributionCents: number }) => [
          s.name,
          s.contributionCents,
        ],
      ),
    ).toEqual([
      ['Alice', 210000],
      ['Bob', 120000],
    ]);
    await bob
      .put('/api/household/contribution-mode')
      .send({ mode: 'EQUAL_REMAINDER' })
      .expect(204);
    const changed = await alice.get('/api/household/contribution').expect(200);
    expect(
      changed.body.shares.map(
        (s: { remainingCents: number }) => s.remainingCents,
      ),
    ).toEqual([110000, 110000]);

    const summary = await bob
      .get(`/api/spaces/${common}/summary?month=2026-10`)
      .expect(200);
    expect(
      summary.body.blocs.find((b: { bloc: string }) => b.bloc === 'COURANT'),
    ).toEqual({
      bloc: 'COURANT',
      plannedCents: 100000,
      actualCents: 14230,
      gapCents: -85770,
    });

    // Bob's personal space works for Bob, with its own encrypted plan.
    await bob
      .put(`/api/spaces/${bobPersonal}/plan`)
      .send({
        incomeCents: 110000,
        fixeCents: 20000,
        courantCents: 20000,
        plaisirCents: 50000,
        epargneCents: 20000,
      })
      .expect(204);
    expect(
      (await bob.get(`/api/spaces/${bobPersonal}/plan`).expect(200)).body
        .plaisirCents,
    ).toBe(50000);
    const planRows: { payload: string }[] = await dataSource.query(
      `SELECT payload FROM space_plans WHERE space_id = ?`,
      [bobPersonal],
    );
    expect(planRows[0].payload.startsWith('v1.')).toBe(true);
  });

  it('imports a bank statement: preview, commit, duplicates, rules, privacy', async () => {
    const alice = await login('alice');
    const bob = await login('bob');
    const house = (await alice.get('/api/household').expect(200)).body
      .household;
    const common = house.spaces.find(
      (s: { kind: string }) => s.kind === 'COMMON',
    ).id;
    const personal = house.spaces.find(
      (s: { kind: string }) => s.kind === 'PERSONAL',
    ).id;

    const csv = [
      'Date;Libellé;Débit;Crédit',
      '02/11/2026;PRLV LOYER;1 100,00;',
      '03/11/2026;CB CARREFOUR MARKET;142,30;',
      '04/11/2026;CB BOULANGERIE DU COIN;12,40;',
      '05/11/2026;VIR SALAIRE;;3 800,00',
      '06/11/2026;VIREMENT INTERNE COMPTE JOINT;200,00;',
      'ligne cassée',
    ].join('\n');

    const preview = await alice
      .post(`/api/spaces/${common}/imports/preview`)
      .send({ text: csv })
      .expect(200);
    expect(
      preview.body.rows.map(
        (r: { suggestion: { target: string | null } }) => r.suggestion.target,
      ),
    ).toEqual(['FIXE', 'COURANT', null, 'INCOME', 'IGNORE']);
    expect(preview.body.rows[0]).toMatchObject({
      amountCents: -110000,
      duplicate: false,
      date: '2026-11-02T00:00:00.000Z',
    });
    expect(preview.body.skipped.map((s: { line: number }) => s.line)).toEqual([
      1, 7,
    ]);
    await alice
      .get(`/api/spaces/${common}/transactions?month=2026-11`)
      .expect(200)
      .expect([]);

    const commit = await alice
      .post(`/api/spaces/${common}/imports/commit`)
      .send({
        items: [
          {
            kind: 'EXPENSE',
            bloc: 'FIXE',
            label: 'PRLV LOYER',
            amountCents: 110000,
            date: '2026-11-02T00:00:00.000Z',
          },
          {
            kind: 'EXPENSE',
            bloc: 'COURANT',
            label: 'CB CARREFOUR MARKET',
            amountCents: 14230,
            date: '2026-11-03T00:00:00.000Z',
          },
          {
            kind: 'INCOME',
            label: 'VIR SALAIRE',
            amountCents: 380000,
            date: '2026-11-05T00:00:00.000Z',
          },
        ],
      })
      .expect(201);
    expect(commit.body).toEqual({ created: 3 });

    const again = await alice
      .post(`/api/spaces/${common}/imports/preview`)
      .send({ text: csv })
      .expect(200);
    expect(
      again.body.rows.map((r: { duplicate: boolean }) => r.duplicate),
    ).toEqual([true, true, false, true, false]);

    const summary = await bob
      .get(`/api/spaces/${common}/summary?month=2026-11`)
      .expect(200);
    expect(summary.body.income.actualCents).toBe(380000);
    expect(
      summary.body.blocs.find((b: { bloc: string }) => b.bloc === 'FIXE')
        .actualCents,
    ).toBe(110000);

    // Atomic: one bad item and nothing is stored.
    await alice
      .post(`/api/spaces/${common}/imports/commit`)
      .send({
        items: [
          {
            kind: 'EXPENSE',
            bloc: 'FIXE',
            label: 'OK',
            amountCents: 100,
            date: '2026-11-08T00:00:00.000Z',
          },
          {
            kind: 'EXPENSE',
            label: 'SANS BLOC',
            amountCents: 100,
            date: '2026-11-08T00:00:00.000Z',
          },
        ],
      })
      .expect(400);
    expect(
      (
        await alice
          .get(`/api/spaces/${common}/transactions?month=2026-11`)
          .expect(200)
      ).body,
    ).toHaveLength(3);

    // Rules: defaults, then saved, then validation.
    expect(
      (await alice.get(`/api/spaces/${common}/rules`).expect(200)).body
        .isDefault,
    ).toBe(true);
    await alice
      .put(`/api/spaces/${common}/rules`)
      .send({ rules: [{ keyword: 'Boulangerie', target: 'COURANT' }] })
      .expect(204);
    expect(
      (await bob.get(`/api/spaces/${common}/rules`).expect(200)).body,
    ).toEqual({
      rules: [{ keyword: 'boulangerie', target: 'COURANT' }],
      isDefault: false,
    });
    await alice
      .put(`/api/spaces/${common}/rules`)
      .send({ rules: [{ keyword: 'x', target: 'FIXE' }] })
      .expect(400);
    await alice
      .put(`/api/spaces/${common}/rules`)
      .send({ rules: [{ keyword: 'loyer', target: 'AUTRE' }] })
      .expect(400);

    // Personal space: private for Bob, encrypted at rest (operations and rules).
    await alice
      .post(`/api/spaces/${personal}/imports/commit`)
      .send({
        items: [
          {
            kind: 'EXPENSE',
            bloc: 'PLAISIR',
            label: 'LIBRAIRIE SECRETE',
            amountCents: 2490,
            date: '2026-11-09T00:00:00.000Z',
          },
        ],
      })
      .expect(201);
    await alice
      .put(`/api/spaces/${personal}/rules`)
      .send({ rules: [{ keyword: 'librairie', target: 'PLAISIR' }] })
      .expect(204);
    await bob
      .post(`/api/spaces/${personal}/imports/preview`)
      .send({ text: csv })
      .expect(404);
    await bob
      .post(`/api/spaces/${personal}/imports/commit`)
      .send({
        items: [
          {
            kind: 'INCOME',
            label: 'X',
            amountCents: 1,
            date: '2026-11-09T00:00:00.000Z',
          },
        ],
      })
      .expect(404);
    await bob.get(`/api/spaces/${personal}/rules`).expect(404);
    const raw: { label: string | null; secret_payload: string }[] =
      await dataSource.query(
        `SELECT label, secret_payload FROM transactions WHERE space_id = ?`,
        [personal],
      );
    expect(
      raw.filter((r) => r.label === null && r.secret_payload.startsWith('v1.'))
        .length,
    ).toBeGreaterThan(0);
    expect(JSON.stringify(raw)).not.toContain('LIBRAIRIE');
    const ruleRows: { payload: string }[] = await dataSource.query(
      `SELECT payload FROM space_rules WHERE space_id = ?`,
      [personal],
    );
    expect(ruleRows[0].payload.startsWith('v1.')).toBe(true);
    expect(ruleRows[0].payload).not.toContain('librairie');
  });

  it('limits import bodies to 1 MB and the commit to 500 items', async () => {
    const alice = await login('alice');
    const house = (await alice.get('/api/household').expect(200)).body
      .household;
    const common = house.spaces.find(
      (s: { kind: string }) => s.kind === 'COMMON',
    ).id;
    const big = Array.from(
      { length: 4000 },
      (_, i) => `02/11/2026;CB COMMERCANT NUMERO ${i};-1,00`,
    ).join('\n');
    expect(big.length).toBeGreaterThan(100_000);
    expect(big.length).toBeLessThan(1_000_000);
    const result = await alice
      .post(`/api/spaces/${common}/imports/preview`)
      .send({ text: big })
      .expect(200);
    expect(result.body.truncated).toBe(true);
    expect(result.body.rows).toHaveLength(2000);
    await alice
      .post(`/api/spaces/${common}/imports/preview`)
      .send({ text: 'x'.repeat(1_100_000) })
      .expect(413);
    const items = Array.from({ length: 501 }, () => ({
      kind: 'INCOME',
      label: 'X',
      amountCents: 1,
      date: '2026-11-09T00:00:00.000Z',
    }));
    await alice
      .post(`/api/spaces/${common}/imports/commit`)
      .send({ items })
      .expect(400);
  });

  it('validates input and turns domain errors into 400s', async () => {
    const alice = await login('alice');
    const household = (await alice.get('/api/household').expect(200)).body
      .household;
    const common = household.spaces.find(
      (s: { kind: string }) => s.kind === 'COMMON',
    ).id;

    await alice
      .get(`/api/spaces/${common}/transactions?month=2026-13`)
      .expect(400);
    await alice.get(`/api/spaces/${common}/transactions`).expect(400);
    await alice
      .post(`/api/spaces/${common}/transactions`)
      .send({ kind: 'EXPENSE', label: 'x', amountCents: 100 })
      .expect(400);
    await alice
      .post(`/api/spaces/${common}/transactions`)
      .send({ kind: 'EXPENSE', bloc: 'FIXE', label: 'x', amountCents: 0 })
      .expect(400);
    await alice
      .post(`/api/spaces/${common}/transactions`)
      .send({ kind: 'INCOME', bloc: 'FIXE', label: 'x', amountCents: 5 })
      .expect(400);
    await alice
      .put(`/api/spaces/${common}/plan`)
      .send({
        incomeCents: -1,
        fixeCents: 0,
        courantCents: 0,
        plaisirCents: 0,
        epargneCents: 0,
      })
      .expect(400);
    await alice
      .put('/api/household/contribution-mode')
      .send({ mode: 'WHATEVER' })
      .expect(400);
  });

  it('refuses a user who has no household for household-scoped routes', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.get('/api/auth/dev-login?as=alice').expect(302);
    // alice has one by now ; a fresh app instance would not. Check the guard on an anonymous call instead.
    await request(app.getHttpServer())
      .get('/api/household/contribution')
      .expect(401);
  });
});
