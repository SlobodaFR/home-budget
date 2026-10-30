import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { Clock } from '../domain/shared/clock';
import { signDevAccessToken } from '../infrastructure/auth/dev-auth';
import { LIFE_EVENT_CATALOG } from '../domain/life-event/catalog';
import { FakeClock } from '../testing/fake-clock';

type Agent = ReturnType<typeof request.agent>;

interface StepView {
  stepId: string;
  title: string;
  detail: string;
  category: string;
  dueDate: string | null;
  dueLabel: string | null;
  status: string;
  doneAt: string | null;
  note: string;
  sourceLabel: string;
  sourceUrl: string;
  link: string | null;
}

interface EventView {
  id: string;
  type: string;
  label: string;
  eventDate: string;
  progressPercent: number;
  doneCount: number;
  totalCount: number;
  steps: StepView[];
}

describe('Life events API (tranche 11, end to end, AUTH_MODE=dev, in-memory SQLite)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  // Le 12 novembre : la naissance du 1er est en retard sur ses démarches courtes.
  const clock = FakeClock.at('2026-11-12T09:30:00Z');
  const env = { ...process.env };

  let alice: Agent;
  let bob: Agent;
  let carol: Agent;
  let anonymous: Agent;
  let common: string;
  let alicePersonal: string;
  let carolCommon: string;

  const BASE = '/api/household/life-events';

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

    // Un troisième utilisateur, d'un autre foyer : jeton de dev signé localement.
    const { token } = await signDevAccessToken(app.get(ConfigService), {
      id: 'dev-carol',
      email: 'carol@example.test',
      name: 'Carol',
    });
    carol = request.agent(app.getHttpServer());
    carol.set('Cookie', `access_token=${token}`);
  });

  afterAll(async () => {
    await app.close();
    process.env = env;
  });

  const events = async (agent: Agent): Promise<EventView[]> =>
    (await agent.get(BASE).expect(200)).body as EventView[];

  const step = (event: EventView, stepId: string): StepView =>
    event.steps.find((s) => s.stepId === stepId)!;

  const insightIds = async (agent: Agent, space = common, month = '2026-11') =>
    (
      (
        await agent
          .get(`/api/spaces/${space}/insights?month=${month}`)
          .expect(200)
      ).body.insights as { id: string }[]
    ).map((i) => i.id);

  it('answers 401 to anonymous callers on every route', async () => {
    await anonymous.get('/api/life-events/catalog').expect(401);
    await anonymous.get(BASE).expect(401);
    await anonymous
      .post(BASE)
      .send({ type: 'BIRTH', eventDate: '2026-11-10' })
      .expect(401);
    await anonymous
      .put(`${BASE}/x`)
      .send({ eventDate: '2026-11-10', label: 'a' })
      .expect(401);
    await anonymous.delete(`${BASE}/x`).expect(401);
    await anonymous.put(`${BASE}/x/steps/y`).send({ done: true }).expect(401);
  });

  it('serves the catalog to any authenticated user, even without household', async () => {
    const response = await alice.get('/api/life-events/catalog').expect(200);
    const catalog = response.body as {
      type: string;
      label: string;
      description: string;
      steps: Record<string, unknown>[];
    }[];
    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({
      type: 'BIRTH',
      label: "Naissance d'un enfant",
      description: "Les démarches et aides à prévoir autour d'une naissance.",
    });
    expect(catalog[0].steps).toHaveLength(LIFE_EVENT_CATALOG[0].steps.length);
    for (const s of catalog[0].steps) {
      expect(Object.keys(s).sort()).toEqual(
        [
          'category',
          'detail',
          'dueLabel',
          'dueOffsetDays',
          'id',
          'link',
          'sourceLabel',
          'sourceUrl',
          'title',
          'verifiedOn',
        ].sort(),
      );
      expect(String(s.sourceUrl).startsWith('https://')).toBe(true);
      expect(s.verifiedOn).toBe('2026-10-30');
    }
    expect(
      catalog[0].steps.find((s) => s.id === 'birth-declaration'),
    ).toMatchObject({
      title: 'Déclarer la naissance à la mairie',
      category: 'ADMIN',
      dueOffsetDays: 5,
      dueLabel: 'Dans les 5 jours après la naissance',
    });
    await carol.get('/api/life-events/catalog').expect(200);
  });

  it('answers 404 to a user without household on the household routes', async () => {
    await alice.get(BASE).expect(404);
    await alice
      .post(BASE)
      .send({ type: 'BIRTH', eventDate: '2026-11-10' })
      .expect(404);
    await alice
      .put(`${BASE}/x`)
      .send({ eventDate: '2026-11-10', label: 'a' })
      .expect(404);
    await alice.delete(`${BASE}/x`).expect(404);
    await alice.put(`${BASE}/x/steps/y`).send({ done: true }).expect(404);
  });

  it('sets up a couple and a separate household', async () => {
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
    const other = await carol
      .post('/api/household')
      .send({ name: 'Autre famille', netMonthlyIncomeCents: 200000 })
      .expect(201);
    carolCommon = (other.body.spaces as { id: string; kind: string }[]).find(
      (sp) => sp.kind === 'COMMON',
    )!.id;
    expect(await events(alice)).toEqual([]);
  });

  let eventId: string;

  it('creates an event, shared by every member of the household and invisible to others', async () => {
    const created = await alice
      .post(BASE)
      .send({ type: 'BIRTH', eventDate: '2026-11-20' })
      .expect(201);
    const body = created.body as EventView;
    eventId = body.id;
    expect(body).toMatchObject({
      type: 'BIRTH',
      label: "Naissance d'un enfant",
      eventDate: '2026-11-20',
      doneCount: 0,
      progressPercent: 0,
      totalCount: LIFE_EVENT_CATALOG[0].steps.length,
    });
    expect(body.steps).toHaveLength(body.totalCount);
    expect(step(body, 'birth-declaration')).toEqual({
      stepId: 'birth-declaration',
      title: 'Déclarer la naissance à la mairie',
      detail: expect.stringContaining('dans les 5 jours'),
      category: 'ADMIN',
      dueDate: '2026-11-25',
      dueLabel: 'Dans les 5 jours après la naissance',
      status: 'DUE_SOON',
      doneAt: null,
      note: '',
      sourceLabel: 'service-public.gouv.fr',
      sourceUrl:
        'https://www.service-public.gouv.fr/particuliers/vosdroits/F961',
      link: null,
    });

    expect((await events(bob)).map((e) => e.id)).toEqual([eventId]);
    expect(await events(carol)).toEqual([]);
  });

  it('isolates the household: another household gets 404 and cannot change anything', async () => {
    await carol
      .put(`${BASE}/${eventId}`)
      .send({ eventDate: '2026-12-01', label: 'Piraté' })
      .expect(404);
    await carol.delete(`${BASE}/${eventId}`).expect(404);
    await carol
      .put(`${BASE}/${eventId}/steps/birth-declaration`)
      .send({ done: true })
      .expect(404);
    const [mine] = await events(alice);
    expect(mine).toMatchObject({
      label: "Naissance d'un enfant",
      eventDate: '2026-11-20',
      doneCount: 0,
    });
    // Et l'événement de l'autre foyer reste à elle seule.
    const theirs = await carol
      .post(BASE)
      .send({ type: 'BIRTH', eventDate: '2027-03-01', label: 'Chez Carol' })
      .expect(201);
    expect((await events(alice)).map((e) => e.label)).toEqual([
      "Naissance d'un enfant",
    ]);
    await alice.delete(`${BASE}/${theirs.body.id}`).expect(404);
    await bob
      .put(`${BASE}/${theirs.body.id}/steps/birth-declaration`)
      .send({ done: true })
      .expect(404);
    await carol.delete(`${BASE}/${theirs.body.id}`).expect(204);
  });

  it('lets a member tick and annotate a step, then recomputes progress, and orders by status', async () => {
    await bob
      .put(`${BASE}/${eventId}/steps/birth-declaration`)
      .send({ done: true, note: 'Fait à la mairie du 3e' })
      .expect(204);
    const [event] = await events(alice);
    expect(event.doneCount).toBe(1);
    expect(event.progressPercent).toBe(Math.floor(100 / event.totalCount));
    expect(step(event, 'birth-declaration')).toMatchObject({
      status: 'DONE',
      doneAt: '2026-11-12T09:30:00.000Z',
      note: 'Fait à la mairie du 3e',
    });
    // DONE en dernier ; les étapes sans échéance juste avant.
    expect(event.steps[event.steps.length - 1].stepId).toBe(
      'birth-declaration',
    );
    const statuses = event.steps.map((s) => s.status);
    const rank = ['OVERDUE', 'DUE_SOON', 'UPCOMING', 'NO_DATE', 'DONE'];
    expect(statuses.map((s) => rank.indexOf(s))).toEqual(
      [...statuses.map((s) => rank.indexOf(s))].sort((a, b) => a - b),
    );

    clock.set('2026-11-13T08:00:00Z');
    await alice
      .put(`${BASE}/${eventId}/steps/birth-declaration`)
      .send({ done: true })
      .expect(204);
    const [again] = await events(alice);
    expect(step(again, 'birth-declaration').doneAt).toBe(
      '2026-11-12T09:30:00.000Z',
    );
    clock.set('2026-11-12T09:30:00Z');

    await bob
      .put(`${BASE}/${eventId}/steps/birth-declaration`)
      .send({ done: false })
      .expect(204);
    const [undone] = await events(alice);
    expect(step(undone, 'birth-declaration')).toMatchObject({
      status: 'DUE_SOON',
      doneAt: null,
      note: 'Fait à la mairie du 3e',
    });
    expect(undone.doneCount).toBe(0);
  });

  it('answers 404 for an unknown step or event', async () => {
    await alice
      .put(`${BASE}/${eventId}/steps/does-not-exist`)
      .send({ done: true })
      .expect(404);
    await alice
      .put(`${BASE}/unknown/steps/birth-declaration`)
      .send({ done: true })
      .expect(404);
  });

  it('changes the date and label, recomputes the deadlines and keeps what is done', async () => {
    await alice
      .put(`${BASE}/${eventId}/steps/birth-tax-declaration`)
      .send({ done: true })
      .expect(204);
    await bob
      .put(`${BASE}/${eventId}`)
      .send({ eventDate: '2026-12-01', label: 'Bébé de décembre' })
      .expect(204);
    const [event] = await events(alice);
    expect(event).toMatchObject({
      label: 'Bébé de décembre',
      eventDate: '2026-12-01',
      doneCount: 1,
    });
    expect(step(event, 'birth-declaration')).toMatchObject({
      dueDate: '2026-12-06',
      status: 'UPCOMING',
    });
    expect(step(event, 'birth-tax-declaration')).toMatchObject({
      dueDate: '2027-01-30',
      status: 'DONE',
    });
  });

  it('rejects invalid input with a 400 in French', async () => {
    const bad = async (
      agent: Agent,
      send: () => request.Test,
      pattern: RegExp,
    ) => {
      const response = await send();
      expect([response.status, JSON.stringify(response.body.message)]).toEqual([
        400,
        expect.stringMatching(pattern),
      ]);
    };
    const post = (body: Record<string, unknown>) => () =>
      alice.post(BASE).send(body);
    await bad(alice, post({ type: 'MOVING', eventDate: '2026-11-10' }), /type/);
    await bad(alice, post({ eventDate: '2026-11-10' }), /type/);
    await bad(alice, post({ type: 'BIRTH' }), /eventDate/);
    await bad(
      alice,
      post({ type: 'BIRTH', eventDate: '10/11/2026' }),
      /AAAA-MM-JJ/,
    );
    await bad(
      alice,
      post({ type: 'BIRTH', eventDate: '2026-02-30' }),
      /invalide/,
    );
    await bad(
      alice,
      post({ type: 'BIRTH', eventDate: '2024-11-11' }),
      /24 mois/,
    );
    await bad(
      alice,
      post({ type: 'BIRTH', eventDate: '2028-05-13' }),
      /18 mois/,
    );
    await bad(
      alice,
      post({ type: 'BIRTH', eventDate: '2026-11-10', label: 'x'.repeat(61) }),
      /label est trop long/,
    );
    await bad(
      alice,
      post({ type: 'BIRTH', eventDate: '2026-11-10', label: '   ' }),
      /vide/,
    );
    await alice
      .post(BASE)
      .send({ type: 'BIRTH', eventDate: '2024-11-12' })
      .expect(201);
    await alice
      .post(BASE)
      .send({ type: 'BIRTH', eventDate: '2028-05-12' })
      .expect(201);

    await bad(
      alice,
      () =>
        alice
          .put(`${BASE}/${eventId}`)
          .send({ eventDate: '2030-01-01', label: 'a' }),
      /mois/,
    );
    await bad(
      alice,
      () =>
        alice
          .put(`${BASE}/${eventId}`)
          .send({ eventDate: '2026-12-01', label: '' }),
      /label/,
    );
    await bad(
      alice,
      () =>
        alice
          .put(`${BASE}/${eventId}/steps/birth-declaration`)
          .send({ done: true, note: 'x'.repeat(201) }),
      /note est trop longue/,
    );
    await bad(
      alice,
      () =>
        alice
          .put(`${BASE}/${eventId}/steps/birth-declaration`)
          .send({ done: 'oui' }),
      /done/,
    );
    await alice
      .put(`${BASE}/${eventId}/steps/birth-declaration`)
      .send({ done: true, note: 'x'.repeat(200) })
      .expect(204);
    // Le libellé par défaut est celui du catalogue.
    const list = await events(bob);
    expect(
      list.filter((e) => e.label === "Naissance d'un enfant"),
    ).toHaveLength(2);
  });

  it('raises overdue and due-soon insights on the common space only, current month only', async () => {
    // On repart d'un foyer sans événement.
    for (const event of await events(alice)) {
      await alice.delete(`${BASE}/${event.id}`).expect(204);
    }
    expect(await insightIds(alice)).not.toContain('life-event-overdue');
    expect(await insightIds(alice)).not.toContain('life-event-due-soon');

    // Naissance le 1er novembre : mairie (5 j) et premier examen (8 j) sont en retard.
    const created = await alice
      .post(BASE)
      .send({ type: 'BIRTH', eventDate: '2026-11-01' })
      .expect(201);
    const view = created.body as EventView;
    expect(step(view, 'birth-declaration').status).toBe('OVERDUE');
    expect(step(view, 'birth-first-medical-exam').status).toBe('OVERDUE');
    const overdue = (
      await alice
        .get(`/api/spaces/${common}/insights?month=2026-11`)
        .expect(200)
    ).body.insights.find((i: { id: string }) => i.id === 'life-event-overdue');
    expect(overdue).toMatchObject({
      severity: 'WARNING',
      link: '/evenements',
      title: '2 démarches en retard',
    });
    expect(overdue.detail).toContain('Déclarer la naissance à la mairie');
    expect(overdue.detail).toContain('Faire passer le premier examen médical');
    // Les deux membres voient le conseil du foyer.
    expect(await insightIds(bob)).toContain('life-event-overdue');
    // Pas pour un espace personnel, ni pour un autre mois, ni pour l'autre foyer.
    expect(await insightIds(alice, alicePersonal)).not.toContain(
      'life-event-overdue',
    );
    expect(await insightIds(alice, common, '2026-10')).not.toContain(
      'life-event-overdue',
    );
    expect(await insightIds(alice, common, '2026-12')).not.toContain(
      'life-event-overdue',
    );
    expect(await insightIds(carol, carolCommon)).not.toContain(
      'life-event-overdue',
    );

    // Cochées, elles ne sont plus en retard.
    for (const stepId of ['birth-declaration', 'birth-first-medical-exam']) {
      await bob
        .put(`${BASE}/${view.id}/steps/${stepId}`)
        .send({ done: true })
        .expect(204);
    }
    expect(await insightIds(alice)).not.toContain('life-event-overdue');

    // Naissance dans 3 jours : mairie (+5 j = dans 8 j) et examen (+8 j) sont bientôt dus.
    await alice.delete(`${BASE}/${view.id}`).expect(204);
    await alice
      .post(BASE)
      .send({ type: 'BIRTH', eventDate: '2026-11-15' })
      .expect(201);
    const soon = (
      await alice
        .get(`/api/spaces/${common}/insights?month=2026-11`)
        .expect(200)
    ).body.insights.find((i: { id: string }) => i.id === 'life-event-due-soon');
    expect(soon).toMatchObject({
      severity: 'ACTION',
      link: '/evenements',
      title: '2 démarches à faire sous 14 jours',
    });
    expect(await insightIds(alice)).not.toContain('life-event-overdue');
  });

  it('deletes an event with its steps', async () => {
    const [event] = await events(alice);
    await alice
      .put(`${BASE}/${event.id}/steps/birth-declaration`)
      .send({ done: true })
      .expect(204);
    const count = async (table: string, column: string): Promise<number> => {
      const rows: { n: number }[] = await dataSource.query(
        `SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`,
        [event.id],
      );
      return rows[0].n;
    };
    expect(await count('life_events', 'id')).toBe(1);
    expect(await count('life_event_steps', 'event_id')).toBe(1);
    await bob.delete(`${BASE}/${event.id}`).expect(204);
    expect(await count('life_events', 'id')).toBe(0);
    expect(await count('life_event_steps', 'event_id')).toBe(0);
    await alice.delete(`${BASE}/${event.id}`).expect(404);
    expect((await events(alice)).map((e) => e.id)).not.toContain(event.id);
  });
});
