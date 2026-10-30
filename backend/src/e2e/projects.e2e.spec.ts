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

describe('Savings projects API (tranche 6, end to end, AUTH_MODE=dev, in-memory SQLite)', () => {
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

  const body = (over: Record<string, unknown> = {}) => ({
    name: 'Vacances été 2027',
    kind: 'HOLIDAY',
    targetCents: 300000,
    targetDate: '2027-07-01',
    startCents: 0,
    startDate: '2026-11-01',
    ...over,
  });
  const deposit = (date: string, amountCents: number, note?: string) => ({
    date,
    amountCents,
    ...(note === undefined ? {} : { note }),
  });

  type ProjectBody = {
    id: string;
    name: string;
    savedCents: number;
    status: string;
    archived: boolean;
    accountId: string | null;
  };
  const projectsOf = async (agent: Agent, space: string) =>
    (await agent.get(`/api/spaces/${space}/projects`).expect(200))
      .body as ProjectBody[];

  let vacances: string;

  it('requires authentication on every route', async () => {
    const anonymous = request(app.getHttpServer());
    const base = `/api/spaces/${common}/projects`;
    await anonymous.get(base).expect(401);
    await anonymous.get(`${base}/summary`).expect(401);
    await anonymous.post(base).send(body()).expect(401);
    await anonymous.put(`${base}/x`).send(body()).expect(401);
    await anonymous.delete(`${base}/x`).expect(401);
    await anonymous.get(`${base}/x/deposits`).expect(401);
    await anonymous
      .post(`${base}/x/deposits`)
      .send(deposit('2026-11-02', 1))
      .expect(401);
    await anonymous.delete(`${base}/x/deposits/y`).expect(401);
  });

  describe('projects', () => {
    it('creates a project and answers with the contract shape', async () => {
      expect(await projectsOf(alice, common)).toEqual([]);
      const created = await alice
        .post(`/api/spaces/${common}/projects`)
        .send(body())
        .expect(201);
      vacances = created.body.id;
      expect(created.body).toEqual({
        id: expect.any(String),
        spaceId: common,
        name: 'Vacances été 2027',
        kind: 'HOLIDAY',
        targetCents: 300000,
        targetDate: '2027-07-01',
        startCents: 0,
        startDate: '2026-11-01',
        savedCents: 0,
        remainingCents: 300000,
        progressPercent: 0,
        monthsLeft: 7,
        monthlyNeededCents: 42858,
        status: 'ON_TRACK',
        expectedSavedCents: 13636,
        archived: false,
        accountId: null,
      });
      expect(await projectsOf(bob, common)).toHaveLength(1);
    });

    it('rejects invalid bodies with a 400 and a French message', async () => {
      const bad: [string, Record<string, unknown>][] = [
        ['empty name', body({ name: '  ' })],
        ['long name', body({ name: 'x'.repeat(81) })],
        ['unknown kind', body({ kind: 'VOITURE' })],
        ['zero target', body({ targetCents: 0 })],
        ['fractional target', body({ targetCents: 10.5 })],
        ['negative start', body({ startCents: -1 })],
        ['text target', body({ targetCents: 'beaucoup' })],
        ['bad date format', body({ targetDate: '01/07/2027' })],
        ['impossible date', body({ targetDate: '2027-02-30' })],
        ['target on the start date', body({ targetDate: '2026-11-01' })],
        ['target before the start date', body({ targetDate: '2026-10-31' })],
        ['missing start date', body({ startDate: undefined })],
        ['unknown account', body({ accountId: 'nope' })],
        ['numeric account', body({ accountId: 12345 })],
      ];
      for (const [name, payload] of bad) {
        const response = await alice
          .post(`/api/spaces/${common}/projects`)
          .send(payload);
        expect({ name, status: response.status }).toEqual({
          name,
          status: 400,
        });
      }
      const domain = await alice
        .post(`/api/spaces/${common}/projects`)
        .send(body({ targetDate: '2026-10-31' }))
        .expect(400);
      expect(domain.body.message).toBe(
        "L'échéance doit être postérieure à la date de début",
      );
      const dto = await alice
        .post(`/api/spaces/${common}/projects`)
        .send(body({ targetCents: 0 }))
        .expect(400);
      expect(JSON.stringify(dto.body.message)).toContain(
        'targetCents doit être strictement positif',
      );
      expect(await projectsOf(alice, common)).toHaveLength(1);
    });

    it('updates, archives and sorts (active by target date first, archived last)', async () => {
      const naissance = (
        await bob
          .post(`/api/spaces/${common}/projects`)
          .send(
            body({
              name: 'Naissance',
              kind: 'BABY',
              targetCents: 100000,
              targetDate: '2027-03-01',
            }),
          )
          .expect(201)
      ).body.id as string;
      expect((await projectsOf(alice, common)).map((p) => p.name)).toEqual([
        'Naissance',
        'Vacances été 2027',
      ]);

      await alice
        .put(`/api/spaces/${common}/projects/${naissance}`)
        .send(
          body({
            name: 'Naissance',
            kind: 'BABY',
            targetCents: 100000,
            targetDate: '2027-03-01',
            archived: true,
          }),
        )
        .expect(204);
      expect(
        (await projectsOf(alice, common)).map((p) => [p.name, p.archived]),
      ).toEqual([
        ['Vacances été 2027', false],
        ['Naissance', true],
      ]);
      await alice
        .put(`/api/spaces/${common}/projects/${naissance}`)
        .send(
          body({
            name: 'Naissance',
            targetCents: 100000,
            targetDate: '2027-03-01',
          }),
        )
        .expect(204);
      expect(
        (await projectsOf(alice, common)).find((p) => p.id === naissance)!
          .archived,
      ).toBe(true);
      await alice
        .put(`/api/spaces/${common}/projects/nope`)
        .send(body())
        .expect(404);
      await alice.delete(`/api/spaces/${common}/projects/nope`).expect(404);
      await alice
        .put(`/api/spaces/${common}/projects/${naissance}`)
        .send(body({ targetCents: -5 }))
        .expect(400);
      await alice
        .delete(`/api/spaces/${common}/projects/${naissance}`)
        .expect(204);
    });

    it('serves the summary route even though :id routes exist', async () => {
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
      const summary = await bob
        .get(`/api/spaces/${common}/projects/summary`)
        .expect(200);
      expect(summary.body).toEqual({
        totalMonthlyNeededCents: 42858,
        plannedEpargneCents: 20000,
        gapCents: 22858,
        activeCount: 1,
      });
    });
  });

  describe('deposits', () => {
    it('adds, lists newest first and removes deposits', async () => {
      const first = await alice
        .post(`/api/spaces/${common}/projects/${vacances}/deposits`)
        .send(deposit('2026-11-03', 40000, 'Prime de Noël'))
        .expect(201);
      expect(first.body).toEqual({
        id: expect.any(String),
        date: '2026-11-03',
        amountCents: 40000,
        note: 'Prime de Noël',
      });
      const second = await bob
        .post(`/api/spaces/${common}/projects/${vacances}/deposits`)
        .send(deposit('2026-11-10', 15000))
        .expect(201);
      expect(second.body.note).toBe('');
      await alice
        .post(`/api/spaces/${common}/projects/${vacances}/deposits`)
        .send(deposit('2026-11-11', -5000, 'Retrait imprévu'))
        .expect(201);

      const listed = (
        await alice
          .get(`/api/spaces/${common}/projects/${vacances}/deposits`)
          .expect(200)
      ).body as { date: string; amountCents: number }[];
      expect(listed.map((d) => [d.date, d.amountCents])).toEqual([
        ['2026-11-11', -5000],
        ['2026-11-10', 15000],
        ['2026-11-03', 40000],
      ]);
      // 40 000 + 15 000 − 5 000 = 50 000 sur 300 000 : 16 %.
      const project = (await projectsOf(alice, common)).find(
        (p) => p.id === vacances,
      )!;
      expect(project).toMatchObject({ savedCents: 50000 });
      const full = (
        await alice.get(`/api/spaces/${common}/projects`).expect(200)
      ).body[0];
      expect(full).toMatchObject({
        savedCents: 50000,
        remainingCents: 250000,
        progressPercent: 16,
        monthsLeft: 7,
        monthlyNeededCents: 35715, // 250 000 / 7 arrondi au supérieur
        expectedSavedCents: 13636,
        status: 'AHEAD', // 50 000 >= 13 636 + 15 000
      });

      await alice
        .delete(
          `/api/spaces/${common}/projects/${vacances}/deposits/${second.body.id}`,
        )
        .expect(204);
      await alice
        .delete(
          `/api/spaces/${common}/projects/${vacances}/deposits/${second.body.id}`,
        )
        .expect(404);
      await alice
        .post(`/api/spaces/${common}/projects/${vacances}/deposits`)
        .send(deposit('2026-11-10', 15000))
        .expect(201);
    });

    it('refuses invalid deposits and any change that would make the savings negative', async () => {
      const url = `/api/spaces/${common}/projects/${vacances}/deposits`;
      for (const payload of [
        deposit('2026-11-10', 0),
        deposit('2026-11-10', 10.5),
        deposit('2026-02-30', 100),
        deposit('10/11/2026', 100),
        deposit('2026-11-10', 100, 'x'.repeat(121)),
        { date: '2026-11-10' },
        { amountCents: 100 },
      ]) {
        await alice.post(url).send(payload).expect(400);
      }
      await alice
        .post(url)
        .send(deposit('2026-11-10', 100, 'x'.repeat(120)))
        .expect(201);
      // 50 100 épargnés : retirer 50 101 est refusé, 50 100 permis.
      const refused = await alice
        .post(url)
        .send(deposit('2026-11-12', -50101))
        .expect(400);
      expect(refused.body.message).toContain('négative');
      const all = await alice
        .post(url)
        .send(deposit('2026-11-12', -50100))
        .expect(201);
      expect((await projectsOf(alice, common))[0].savedCents).toBe(0);
      await alice.delete(`${url}/${all.body.id}`).expect(204);
      // Supprimer un versement couvert par un retrait ultérieur est refusé.
      const list = (await alice.get(url).expect(200)).body as {
        id: string;
        date: string;
        amountCents: number;
      }[];
      const covered = list.find((d) => d.amountCents === 40000)!;
      await alice.delete(`${url}/${covered.id}`).expect(204);
      await alice.post(url).send(deposit('2026-11-03', 40000)).expect(201);
      // Baisser le départ en dessous de ce que les retraits permettent est refusé.
      await alice.post(url).send(deposit('2026-11-13', -50099)).expect(201);
      await alice
        .put(`/api/spaces/${common}/projects/${vacances}`)
        .send(body({ startCents: 0 }))
        .expect(204);
      await alice.post(url).send(deposit('2026-11-14', 1)).expect(201);
    });

    it('answers 404 for a deposit of another project and for unknown projects', async () => {
      const other = (
        await alice
          .post(`/api/spaces/${common}/projects`)
          .send(body({ name: 'Autre' }))
          .expect(201)
      ).body.id as string;
      const dep = (
        await alice
          .post(`/api/spaces/${common}/projects/${other}/deposits`)
          .send(deposit('2026-11-02', 1000))
          .expect(201)
      ).body.id as string;
      await alice
        .delete(`/api/spaces/${common}/projects/${vacances}/deposits/${dep}`)
        .expect(404);
      await alice
        .get(`/api/spaces/${common}/projects/nope/deposits`)
        .expect(404);
      await alice
        .post(`/api/spaces/${common}/projects/nope/deposits`)
        .send(deposit('2026-11-02', 1))
        .expect(404);
      // Suppression en cascade : les versements disparaissent avec leur projet.
      const before: { n: number }[] = await dataSource.query(
        `SELECT COUNT(*) AS n FROM project_deposits WHERE project_id = ?`,
        [other],
      );
      expect(before[0].n).toBe(1);
      await alice.delete(`/api/spaces/${common}/projects/${other}`).expect(204);
      const after: { n: number }[] = await dataSource.query(
        `SELECT COUNT(*) AS n FROM project_deposits WHERE project_id = ?`,
        [other],
      );
      expect(after[0].n).toBe(0);
      const kept: { n: number }[] = await dataSource.query(
        `SELECT COUNT(*) AS n FROM project_deposits WHERE project_id = ?`,
        [vacances],
      );
      expect(kept[0].n).toBeGreaterThan(0);
      await alice
        .get(`/api/spaces/${common}/projects/${other}/deposits`)
        .expect(404);
    });
  });

  describe('accounts', () => {
    it('validates accountId like for operations and protects the account from deletion', async () => {
      const livret = (
        await alice
          .post(`/api/spaces/${common}/accounts`)
          .send({
            name: 'Livret A',
            kind: 'SAVINGS',
            openingBalanceCents: 0,
            openingDate: '2026-01-01',
          })
          .expect(201)
      ).body.id as string;
      const personalAccount = (
        await alice
          .post(`/api/spaces/${alicePersonal}/accounts`)
          .send({
            name: 'Cagnotte',
            kind: 'CHECKING',
            openingBalanceCents: 0,
            openingDate: '2026-01-01',
          })
          .expect(201)
      ).body.id as string;
      const old = (
        await alice
          .post(`/api/spaces/${common}/accounts`)
          .send({
            name: 'Vieux livret',
            kind: 'SAVINGS',
            openingBalanceCents: 0,
            openingDate: '2026-01-01',
          })
          .expect(201)
      ).body.id as string;
      await alice
        .put(`/api/spaces/${common}/accounts/${old}`)
        .send({
          name: 'Vieux livret',
          kind: 'SAVINGS',
          openingBalanceCents: 0,
          openingDate: '2026-01-01',
          archived: true,
        })
        .expect(204);

      for (const id of [personalAccount, old, 'nope']) {
        await alice
          .post(`/api/spaces/${common}/projects`)
          .send(body({ accountId: id }))
          .expect(400);
      }
      await alice
        .post(`/api/spaces/${alicePersonal}/projects`)
        .send(body({ accountId: livret }))
        .expect(400);
      const attached = await alice
        .post(`/api/spaces/${common}/projects`)
        .send(body({ name: 'Sur livret', accountId: livret }))
        .expect(201);
      expect(attached.body.accountId).toBe(livret);
      const refusal = await alice
        .delete(`/api/spaces/${common}/accounts/${livret}`)
        .expect(400);
      expect(refusal.body.message).toContain('archivez-le');
      await alice
        .delete(`/api/spaces/${common}/projects/${attached.body.id}`)
        .expect(204);
      await alice
        .delete(`/api/spaces/${common}/accounts/${livret}`)
        .expect(204);
      await alice
        .delete(`/api/spaces/${alicePersonal}/accounts/${personalAccount}`)
        .expect(204);
    });
  });

  describe('insights', () => {
    it('warns about a project behind, a plan that cannot fund the projects, and celebrates a goal reached', async () => {
      // Date 20 novembre : le projet « Vacances » (reste 249 900 − …) est lancé ; on isole de nouveaux projets.
      const lagging = (
        await alice
          .post(`/api/spaces/${common}/projects`)
          .send(
            body({
              name: 'Voiture',
              kind: 'PURCHASE',
              targetCents: 600000,
              targetDate: '2027-11-01',
              startDate: '2026-01-01',
            }),
          )
          .expect(201)
      ).body;
      expect(lagging.status).toBe('BEHIND');
      const small = (
        await alice
          .post(`/api/spaces/${common}/projects`)
          .send(
            body({
              name: 'Cadeau',
              kind: 'GENERIC',
              targetCents: 20000,
              targetDate: '2027-01-01',
            }),
          )
          .expect(201)
      ).body.id as string;
      await alice
        .post(`/api/spaces/${common}/projects/${small}/deposits`)
        .send(deposit('2026-11-10', 20000))
        .expect(201);

      const insights = (
        await bob
          .get(`/api/spaces/${common}/insights?month=2026-11`)
          .expect(200)
      ).body.insights as {
        id: string;
        severity: string;
        title: string;
        detail: string;
        link: string;
      }[];
      const behind = insights.find((i) => i.id === 'project-behind')!;
      expect(behind).toMatchObject({ severity: 'WARNING', link: '/projets' });
      expect(behind.detail).toContain('Voiture');
      const exceed = insights.find((i) => i.id === 'projects-exceed-savings')!;
      expect(exceed).toMatchObject({ severity: 'ACTION', link: '/plan' });
      expect(exceed.detail).toContain(
        `le bloc Épargne de votre plan en prévoit 200${NBSP}€`,
      );
      const reached = insights.find((i) => i.id === 'project-reached')!;
      expect(reached).toEqual({
        id: 'project-reached',
        severity: 'GOOD',
        title: 'Objectif atteint : Cadeau',
        detail: `Cadeau : 200${NBSP}€ épargnés. Bravo !`,
        lesson: 1,
        link: '/projets',
      });
      expect(insights.length).toBeLessThanOrEqual(8);
      const rank: Record<string, number> = {
        WARNING: 0,
        ACTION: 1,
        INFO: 2,
        GOOD: 3,
      };
      const ranks = insights.map((i) => rank[i.severity]);
      expect([...ranks].sort()).toEqual(ranks);

      // Plus de 30 jours plus tard, la célébration disparaît.
      clock.set('2026-12-20T09:30:00Z');
      try {
        const later = (
          await bob
            .get(`/api/spaces/${common}/insights?month=2026-12`)
            .expect(200)
        ).body.insights as { id: string }[];
        expect(later.map((i) => i.id)).not.toContain('project-reached');
      } finally {
        clock.set('2026-11-12T09:30:00Z');
      }
    });
  });

  describe('personal spaces: encryption and isolation', () => {
    let secretProject: string;
    let secretDeposit: string;

    it('encrypts name, target, start amount, deposit amounts and notes at rest', async () => {
      const created = await alice
        .post(`/api/spaces/${alicePersonal}/projects`)
        .send(
          body({
            name: 'Cadeau de mariage secret',
            targetCents: 777777,
            startCents: 12345,
          }),
        )
        .expect(201);
      secretProject = created.body.id;
      expect(created.body).toMatchObject({
        name: 'Cadeau de mariage secret',
        targetCents: 777777,
        startCents: 12345,
        savedCents: 12345,
      });
      const dep = await alice
        .post(`/api/spaces/${alicePersonal}/projects/${secretProject}/deposits`)
        .send(deposit('2026-11-05', 98765, 'Note très privée'))
        .expect(201);
      secretDeposit = dep.body.id;

      const projectRows: Record<string, unknown>[] = await dataSource.query(
        `SELECT * FROM projects WHERE space_id = ?`,
        [alicePersonal],
      );
      expect(projectRows).toHaveLength(1);
      expect(projectRows[0].name).toBeNull();
      expect(projectRows[0].target_cents).toBeNull();
      expect(projectRows[0].start_cents).toBeNull();
      expect(String(projectRows[0].secret_payload).startsWith('v1.')).toBe(
        true,
      );
      const depositRows: Record<string, unknown>[] = await dataSource.query(
        `SELECT * FROM project_deposits WHERE space_id = ?`,
        [alicePersonal],
      );
      expect(depositRows).toHaveLength(1);
      expect(depositRows[0].amount_cents).toBeNull();
      expect(depositRows[0].note).toBeNull();
      expect(String(depositRows[0].secret_payload).startsWith('v1.')).toBe(
        true,
      );

      // Rien d'identifiable dans les colonnes de données (les identifiants sont des UUID aléatoires).
      const raw = JSON.stringify([
        projectRows.map(
          ({ name, target_cents, start_cents, secret_payload }) => [
            name,
            target_cents,
            start_cents,
            secret_payload,
          ],
        ),
        depositRows.map(({ amount_cents, note, secret_payload }) => [
          amount_cents,
          note,
          secret_payload,
        ]),
      ]);
      for (const secret of [
        'mariage',
        'Cadeau',
        '777777',
        '12345',
        '98765',
        'privée',
        'Note',
      ]) {
        expect(raw).not.toContain(secret);
      }
      // Les métadonnées de planification restent en clair.
      expect(projectRows[0]).toMatchObject({
        kind: 'HOLIDAY',
        target_date: '2027-07-01',
        start_date: '2026-11-01',
        archived: 0,
      });
      expect(depositRows[0]).toMatchObject({
        date: '2026-11-05',
        project_id: secretProject,
      });

      // Le commun, lui, est en clair.
      const common_: { name: string; target_cents: number }[] =
        await dataSource.query(
          `SELECT name, target_cents FROM projects WHERE space_id = ? ORDER BY name`,
          [common],
        );
      expect(common_[0].name).toBeTruthy();
      expect(common_[0].target_cents).toBeGreaterThan(0);

      // Le propriétaire relit tout en clair.
      expect((await projectsOf(alice, alicePersonal))[0]).toMatchObject({
        name: 'Cadeau de mariage secret',
        savedCents: 12345 + 98765,
      });
      expect(
        (
          await alice
            .get(
              `/api/spaces/${alicePersonal}/projects/${secretProject}/deposits`,
            )
            .expect(200)
        ).body[0],
      ).toEqual({
        id: secretDeposit,
        date: '2026-11-05',
        amountCents: 98765,
        note: 'Note très privée',
      });
      expect(
        (
          await alice
            .get(`/api/spaces/${alicePersonal}/projects/summary`)
            .expect(200)
        ).body.activeCount,
      ).toBe(1);
    });

    it('gives the other member a 404 on every route of a personal space', async () => {
      const base = `/api/spaces/${alicePersonal}/projects`;
      await bob.get(base).expect(404);
      await bob.get(`${base}/summary`).expect(404);
      await bob
        .post(base)
        .send(body({ name: 'Intrusion' }))
        .expect(404);
      await bob
        .put(`${base}/${secretProject}`)
        .send(body({ name: 'Intrusion' }))
        .expect(404);
      await bob.delete(`${base}/${secretProject}`).expect(404);
      await bob.get(`${base}/${secretProject}/deposits`).expect(404);
      await bob
        .post(`${base}/${secretProject}/deposits`)
        .send(deposit('2026-11-06', 1))
        .expect(404);
      await bob
        .delete(`${base}/${secretProject}/deposits/${secretDeposit}`)
        .expect(404);
      await bob
        .get(`/api/spaces/${alicePersonal}/insights?month=2026-11`)
        .expect(404);
    });

    it('does not let a project or deposit be reached through another space', async () => {
      for (const space of [common, bobPersonal]) {
        const base = `/api/spaces/${space}/projects`;
        await bob
          .put(`${base}/${secretProject}`)
          .send(body({ name: 'Intrusion' }))
          .expect(404);
        await bob.delete(`${base}/${secretProject}`).expect(404);
        await bob.get(`${base}/${secretProject}/deposits`).expect(404);
        await bob
          .post(`${base}/${secretProject}/deposits`)
          .send(deposit('2026-11-06', 1))
          .expect(404);
        await bob
          .delete(`${base}/${secretProject}/deposits/${secretDeposit}`)
          .expect(404);
      }
      // Même Alice ne peut pas atteindre son projet personnel par l'espace commun.
      await alice
        .delete(`/api/spaces/${common}/projects/${secretProject}`)
        .expect(404);
      expect(JSON.stringify(await projectsOf(bob, common))).not.toContain(
        'mariage',
      );
      expect(await projectsOf(bob, bobPersonal)).toEqual([]);
      // Rien n'a changé pour Alice.
      expect((await projectsOf(alice, alicePersonal))[0].name).toBe(
        'Cadeau de mariage secret',
      );
    });

    it('lets a personal project be deleted along with its encrypted deposits', async () => {
      await alice
        .delete(`/api/spaces/${alicePersonal}/projects/${secretProject}`)
        .expect(204);
      const left: { n: number }[] = await dataSource.query(
        `SELECT COUNT(*) AS n FROM project_deposits WHERE space_id = ?`,
        [alicePersonal],
      );
      expect(left[0].n).toBe(0);
    });
  });
});
