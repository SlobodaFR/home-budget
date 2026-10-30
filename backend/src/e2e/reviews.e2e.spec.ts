import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { Clock } from '../domain/shared/clock';
import { FakeClock } from '../testing/fake-clock';

type Agent = ReturnType<typeof request.agent>;

describe('Monthly review and export API (tranche 7, end to end, AUTH_MODE=dev, in-memory SQLite)', () => {
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
  });

  afterAll(async () => {
    await app.close();
    process.env = env;
  });

  /** Lit le corps tel quel, en octets (le BOM doit être vérifié sur les octets). */
  const binary = (
    res: request.Response,
    cb: (err: Error | null, body: Buffer) => void,
  ) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };

  const answers = (decision = '', wentWell = '', surprise = '') => ({
    wentWell,
    surprise,
    decision,
  });

  it('answers 404 to a user without household on the export, and 401 to anonymous callers on every new route', async () => {
    await bob.get('/api/export').expect(404);
    const anonymous = request(app.getHttpServer());
    await anonymous.get('/api/export').expect(401);
    for (const path of [
      '/api/spaces/x/reviews',
      '/api/spaces/x/reviews/2026-10',
      '/api/spaces/x/transactions/export?from=2026-10-01&to=2026-10-31',
    ]) {
      await anonymous.get(path).expect(401);
    }
    await anonymous.put('/api/spaces/x/reviews/2026-10').send({}).expect(401);
  });

  it('sets up a couple', async () => {
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
    const post = (space: string, body: Record<string, unknown>) =>
      alice.post(`/api/spaces/${space}/transactions`).send(body).expect(201);
    await post(common, {
      kind: 'INCOME',
      label: 'Salaire',
      amountCents: 380000,
      date: '2026-10-28T10:00:00.000Z',
    });
    await post(common, {
      kind: 'EXPENSE',
      bloc: 'FIXE',
      label: 'PRLV LOYER',
      amountCents: 110000,
      date: '2026-10-05T10:00:00.000Z',
    });
    await post(common, {
      kind: 'EXPENSE',
      bloc: 'FIXE',
      label: 'EDF',
      amountCents: 61000,
      date: '2026-10-10T10:00:00.000Z',
    });
    await post(common, {
      kind: 'EXPENSE',
      bloc: 'COURANT',
      label: 'Courses',
      amountCents: 50000,
      date: '2026-10-03T10:00:00.000Z',
    });
    await post(common, {
      kind: 'EXPENSE',
      bloc: 'COURANT',
      label: 'COURSES',
      amountCents: 60000,
      date: '2026-10-12T10:00:00.000Z',
    });
    await post(common, {
      kind: 'EXPENSE',
      bloc: 'COURANT',
      label: 'Courses',
      amountCents: 32300,
      date: '2026-10-20T10:00:00.000Z',
    });
    await post(common, {
      kind: 'EXPENSE',
      bloc: 'PLAISIR',
      label: 'Café Étoilé',
      amountCents: 3000,
      date: '2026-10-06T10:00:00.000Z',
    });
    await alice
      .post(`/api/spaces/${common}/recurring`)
      .send({
        kind: 'EXPENSE',
        bloc: 'FIXE',
        label: 'Assurance',
        amountCents: 5000,
        dayOfMonth: 8,
        startDate: '2026-01-01',
        active: true,
      })
      .expect(201);
  });

  describe('reviews', () => {
    it('starts as TODO with the recomputed snapshot (contract shape)', async () => {
      const response = await bob
        .get(`/api/spaces/${common}/reviews/2026-10`)
        .expect(200);
      expect(response.body).toEqual({
        month: '2026-10',
        status: 'TODO',
        answers: { wentWell: '', surprise: '', decision: '' },
        completedAt: null,
        snapshot: {
          incomeCents: 380000,
          // 171 000 + 142 300 + 3 000
          expenseCents: 316300,
          balanceCents: 63700,
          savingsRatePercent: 17, // 16,76
          blocs: [
            {
              bloc: 'FIXE',
              plannedCents: 175000,
              actualCents: 171000,
              deltaCents: -4000,
            },
            {
              bloc: 'COURANT',
              plannedCents: 100000,
              actualCents: 142300,
              deltaCents: 42300,
            },
            {
              bloc: 'PLAISIR',
              plannedCents: 45000,
              actualCents: 3000,
              deltaCents: -42000,
            },
            {
              bloc: 'EPARGNE',
              plannedCents: 20000,
              actualCents: 0,
              deltaCents: -20000,
            },
          ],
          topExpenses: [
            { label: 'COURSES', amountCents: 142300, count: 3 },
            { label: 'PRLV LOYER', amountCents: 110000, count: 1 },
            { label: 'EDF', amountCents: 61000, count: 1 },
            { label: 'Café Étoilé', amountCents: 3000, count: 1 },
          ],
          missingRecurring: [{ label: 'Assurance', amountCents: 5000 }],
          unassignedTransactionCount: 0,
        },
      });
    });

    it('refuses a future month and a malformed one with a 400', async () => {
      await alice.get(`/api/spaces/${common}/reviews/2026-12`).expect(400);
      await alice.get(`/api/spaces/${common}/reviews/2027-01`).expect(400);
      await alice.get(`/api/spaces/${common}/reviews/2026-13`).expect(400);
      await alice.get(`/api/spaces/${common}/reviews/octobre`).expect(400);
      await alice
        .put(`/api/spaces/${common}/reviews/2026-12`)
        .send({ answers: answers('x'), complete: false })
        .expect(400);
      // Le mois en cours et un mois sans aucune donnée restent lisibles.
      await alice.get(`/api/spaces/${common}/reviews/2026-11`).expect(200);
      const empty = (
        await alice.get(`/api/spaces/${common}/reviews/2020-01`).expect(200)
      ).body;
      expect(empty.snapshot).toMatchObject({
        incomeCents: 0,
        savingsRatePercent: 0,
        topExpenses: [],
      });
    });

    it('saves a draft, completes, edits and reopens', async () => {
      const url = `/api/spaces/${common}/reviews/2026-10`;
      await alice
        .put(url)
        .send({ answers: answers('', 'Épargne tenue'), complete: false })
        .expect(204);
      expect((await bob.get(url).expect(200)).body).toMatchObject({
        status: 'DRAFT',
        completedAt: null,
        answers: { wentWell: 'Épargne tenue', surprise: '', decision: '' },
      });

      // Terminer sans décision : refusé.
      const refused = await alice
        .put(url)
        .send({ answers: answers('   ', 'Épargne tenue'), complete: true })
        .expect(400);
      expect(refused.body.message).toContain('décision');
      expect((await alice.get(url).expect(200)).body.status).toBe('DRAFT');

      await alice
        .put(url)
        .send({
          answers: answers(
            'Cuisiner plus',
            'Épargne tenue',
            'Le prix des courses',
          ),
          complete: true,
        })
        .expect(204);
      const done = (await bob.get(url).expect(200)).body;
      expect(done).toMatchObject({
        status: 'DONE',
        completedAt: '2026-11-12T09:30:00.000Z',
        answers: {
          wentWell: 'Épargne tenue',
          surprise: 'Le prix des courses',
          decision: 'Cuisiner plus',
        },
      });

      // Une revue DONE reste modifiable et garde sa date de fin.
      clock.set('2026-11-20T09:30:00Z');
      try {
        await bob
          .put(url)
          .send({ answers: answers('Cuisiner beaucoup plus'), complete: true })
          .expect(204);
      } finally {
        clock.set('2026-11-12T09:30:00Z');
      }
      expect((await alice.get(url).expect(200)).body).toMatchObject({
        status: 'DONE',
        completedAt: '2026-11-12T09:30:00.000Z',
        answers: { decision: 'Cuisiner beaucoup plus' },
      });
      // Une seule ligne par (espace, mois).
      const rows: { n: number }[] = await dataSource.query(
        `SELECT COUNT(*) AS n FROM month_reviews WHERE space_id = ? AND month = '2026-10'`,
        [common],
      );
      expect(rows[0].n).toBe(1);

      // Rouvrir (complete: false) : brouillon ; tout effacer : TODO.
      await alice
        .put(url)
        .send({ answers: answers('Cuisiner beaucoup plus'), complete: false })
        .expect(204);
      expect((await alice.get(url).expect(200)).body).toMatchObject({
        status: 'DRAFT',
        completedAt: null,
      });
      await alice
        .put(url)
        .send({ answers: answers(), complete: false })
        .expect(204);
      expect((await alice.get(url).expect(200)).body.status).toBe('TODO');
      const left: { n: number }[] = await dataSource.query(
        `SELECT COUNT(*) AS n FROM month_reviews WHERE space_id = ?`,
        [common],
      );
      expect(left[0].n).toBe(0);
      await alice
        .put(url)
        .send({ answers: answers('Cuisiner plus'), complete: true })
        .expect(204);
    });

    it('validates the body with French messages', async () => {
      const url = `/api/spaces/${common}/reviews/2026-09`;
      for (const key of ['wentWell', 'surprise', 'decision']) {
        const response = await alice
          .put(url)
          .send({
            answers: { ...answers('x'), [key]: 'x'.repeat(501) },
            complete: false,
          })
          .expect(400);
        expect(JSON.stringify(response.body.message)).toContain(
          `${key} est trop long`,
        );
        await alice
          .put(url)
          .send({
            answers: { ...answers('x'), [key]: 'x'.repeat(500) },
            complete: false,
          })
          .expect(204);
      }
      await alice
        .put(url)
        .send({ answers: answers('x') })
        .expect(400);
      await alice.put(url).send({ complete: false }).expect(400);
      await alice
        .put(url)
        .send({ answers: { decision: 12 }, complete: false })
        .expect(400);
      await alice
        .put(url)
        .send({ answers: 'oui', complete: false })
        .expect(400);
      // Des réponses absentes valent chaînes vides.
      await alice
        .put(url)
        .send({ answers: { decision: 'Seule la décision' }, complete: true })
        .expect(204);
      expect((await alice.get(url).expect(200)).body.answers).toEqual({
        wentWell: '',
        surprise: '',
        decision: 'Seule la décision',
      });
    });

    it('lists the non-TODO history, newest first, with a limit', async () => {
      await alice
        .put(`/api/spaces/${common}/reviews/2026-08`)
        .send({ answers: answers('', 'Brouillon août'), complete: false })
        .expect(204);
      const history = (
        await bob.get(`/api/spaces/${common}/reviews`).expect(200)
      ).body as {
        month: string;
        status: string;
        decision: string;
        completedAt: string | null;
      }[];
      expect(history).toEqual([
        {
          month: '2026-10',
          status: 'DONE',
          decision: 'Cuisiner plus',
          completedAt: '2026-11-12T09:30:00.000Z',
        },
        {
          month: '2026-09',
          status: 'DONE',
          decision: 'Seule la décision',
          completedAt: '2026-11-12T09:30:00.000Z',
        },
        { month: '2026-08', status: 'DRAFT', decision: '', completedAt: null },
      ]);
      expect(
        (await bob.get(`/api/spaces/${common}/reviews?limit=2`).expect(200))
          .body,
      ).toHaveLength(2);
      expect(
        (await bob.get(`/api/spaces/${common}/reviews?limit=1`).expect(200))
          .body[0].month,
      ).toBe('2026-10');
      for (const bad of ['0', '121', 'abc', '1.5']) {
        await bob.get(`/api/spaces/${common}/reviews?limit=${bad}`).expect(400);
      }
    });
  });

  describe('insights', () => {
    it('invites to the review, then celebrates the decision once it is DONE', async () => {
      clock.set('2026-11-04T09:30:00Z');
      try {
        const url = `/api/spaces/${common}/reviews/2026-10`;
        await alice
          .put(url)
          .send({ answers: answers('Cuisiner plus', 'Bien'), complete: false })
          .expect(204);
        const draft = (
          await bob
            .get(`/api/spaces/${common}/insights?month=2026-11`)
            .expect(200)
        ).body.insights as { id: string; link: string }[];
        expect(draft.find((i) => i.id === 'monthly-review')).toMatchObject({
          link: '/revue',
        });
        expect(draft.map((i) => i.id)).not.toContain('review-done');

        await alice
          .put(url)
          .send({ answers: answers('Cuisiner plus', 'Bien'), complete: true })
          .expect(204);
        for (const month of ['2026-11', '2026-10']) {
          const insights = (
            await bob
              .get(`/api/spaces/${common}/insights?month=${month}`)
              .expect(200)
          ).body.insights as {
            id: string;
            severity: string;
            title: string;
            detail: string;
            link: string;
          }[];
          expect(insights.map((i) => i.id)).not.toContain('monthly-review');
          expect(insights.find((i) => i.id === 'review-done')).toMatchObject({
            severity: 'GOOD',
            title: 'Revue de octobre 2026 faite',
            detail:
              'Décision prise : « Cuisiner plus ». Gardez le cap ce mois-ci.',
            link: '/revue',
          });
        }
      } finally {
        clock.set('2026-11-12T09:30:00Z');
      }
      // Après le 7, ni l'un ni l'autre.
      const later = (
        await bob
          .get(`/api/spaces/${common}/insights?month=2026-11`)
          .expect(200)
      ).body.insights as { id: string }[];
      expect(later.map((i) => i.id)).not.toEqual(
        expect.arrayContaining(['review-done']),
      );
      expect(later.map((i) => i.id)).not.toContain('monthly-review');
    });
  });

  describe('personal reviews: encryption and isolation', () => {
    it('encrypts the answers at rest and shows them to the owner only', async () => {
      await alice
        .put(`/api/spaces/${alicePersonal}/reviews/2026-10`)
        .send({
          answers: answers(
            'Offrir un voyage surprise',
            'Prime inattendue',
            'Le prix du cadeau',
          ),
          complete: true,
        })
        .expect(204);
      const rows: Record<string, unknown>[] = await dataSource.query(
        `SELECT * FROM month_reviews WHERE space_id = ?`,
        [alicePersonal],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].went_well).toBeNull();
      expect(rows[0].surprise).toBeNull();
      expect(rows[0].decision).toBeNull();
      expect(String(rows[0].secret_payload).startsWith('v1.')).toBe(true);
      const raw = JSON.stringify([
        rows[0].went_well,
        rows[0].surprise,
        rows[0].decision,
        rows[0].secret_payload,
      ]);
      for (const secret of ['voyage', 'Prime', 'cadeau', 'surprise']) {
        expect(raw).not.toContain(secret);
      }
      expect(rows[0]).toMatchObject({ month: '2026-10' });
      expect(rows[0].completed_at).toBe('2026-11-12T09:30:00.000Z');

      const common_: { decision: string }[] = await dataSource.query(
        `SELECT decision FROM month_reviews WHERE space_id = ? AND month = '2026-10'`,
        [common],
      );
      expect(common_[0].decision).toBe('Cuisiner plus');

      expect(
        (
          await alice
            .get(`/api/spaces/${alicePersonal}/reviews/2026-10`)
            .expect(200)
        ).body,
      ).toMatchObject({
        status: 'DONE',
        answers: { decision: 'Offrir un voyage surprise' },
      });
      expect(
        (await alice.get(`/api/spaces/${alicePersonal}/reviews`).expect(200))
          .body[0].decision,
      ).toBe('Offrir un voyage surprise');
    });

    it('gives the other member a 404 on every review route of a personal space', async () => {
      const base = `/api/spaces/${alicePersonal}/reviews`;
      await bob.get(base).expect(404);
      await bob.get(`${base}/2026-10`).expect(404);
      await bob
        .put(`${base}/2026-10`)
        .send({ answers: answers('Intrusion'), complete: true })
        .expect(404);
      await bob
        .get(`/api/spaces/${bobPersonal}/reviews/2026-10`)
        .expect(200)
        .expect((r) => {
          expect(r.body.status).toBe('TODO');
        });
      expect(
        (await alice.get(`${base}/2026-10`).expect(200)).body.answers.decision,
      ).toBe('Offrir un voyage surprise');
    });
  });

  describe('CSV export of the operations', () => {
    const csvUrl = (space: string, from: string, to: string) =>
      `/api/spaces/${space}/transactions/export?from=${from}&to=${to}`;

    it('answers with UTF-8 BOM, ; separator, decimal comma and download headers', async () => {
      const response = await bob
        .get(csvUrl(common, '2026-10-01', '2026-10-31'))
        .buffer(true)
        .parse(binary)
        .expect(200);
      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(response.headers['content-disposition']).toBe(
        'attachment; filename="operations-2026-10-01_2026-10-31.csv"',
      );
      const bytes = response.body as Buffer;
      expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      const lines = bytes.subarray(3).toString('utf8').split('\r\n');
      expect(lines[0]).toBe('Date;Type;Bloc;Libellé;Montant;Compte');
      expect(lines).toContain('2026-10-05;Dépense;Fixe;PRLV LOYER;1100,00;');
      expect(lines).toContain('2026-10-28;Revenu;;Salaire;3800,00;');
      expect(lines).toContain('2026-10-06;Dépense;Plaisir;Café Étoilé;30,00;');
      expect(lines.filter((l) => l.includes(';Courses;'))).toHaveLength(2);
      // Trié par date croissante.
      const dates = lines.slice(1, -1).map((l) => l.slice(0, 10));
      expect([...dates].sort()).toEqual(dates);
      expect(lines.at(-1)).toBe('');
    });

    it('includes both bounds and nothing outside the period', async () => {
      const text = (
        await alice.get(csvUrl(common, '2026-10-05', '2026-10-06')).expect(200)
      ).text;
      expect(text.charCodeAt(0)).toBe(0xfeff);
      const body = text.slice(1).split('\r\n').slice(1, -1);
      expect(body.map((l) => l.split(';')[3])).toEqual([
        'PRLV LOYER',
        'Café Étoilé',
      ]);
    });

    it('neutralises formula injection and escapes quotes, separators and line breaks', async () => {
      const labels = [
        '=SOMME(1;2)',
        '+33600000000',
        '-2+3',
        '@cmd',
        'dit "oui"',
        'a;b',
        'ligne\nsuivante',
        '\t=1+1',
      ];
      for (const [i, label] of labels.entries()) {
        await alice
          .post(`/api/spaces/${common}/transactions`)
          .send({
            kind: 'EXPENSE',
            bloc: 'PLAISIR',
            label,
            amountCents: 100 + i,
            date: '2026-09-15T10:00:00.000Z',
          })
          .expect(201);
      }
      const response = await alice
        .get(csvUrl(common, '2026-09-01', '2026-09-30'))
        .buffer(true)
        .parse(binary)
        .expect(200);
      const csv = (response.body as Buffer).subarray(3).toString('utf8');
      const rows = csv.split('\r\n');
      expect(rows).toContain(`2026-09-15;Dépense;Plaisir;"'=SOMME(1;2)";1,00;`);
      expect(rows).toContain("2026-09-15;Dépense;Plaisir;'+33600000000;1,01;");
      expect(rows).toContain("2026-09-15;Dépense;Plaisir;'-2+3;1,02;");
      expect(rows).toContain("2026-09-15;Dépense;Plaisir;'@cmd;1,03;");
      expect(rows).toContain('2026-09-15;Dépense;Plaisir;"dit ""oui""";1,04;');
      expect(rows).toContain('2026-09-15;Dépense;Plaisir;"a;b";1,05;');
      expect(csv).toContain(
        '2026-09-15;Dépense;Plaisir;"ligne\nsuivante";1,06;\r\n',
      );
      // La tabulation en tête est retirée dès la saisie (libellé nettoyé) ; l'apostrophe protège le reste.
      expect(rows).toContain("2026-09-15;Dépense;Plaisir;'=1+1;1,07;");
      // Aucune cellule du libellé ne commence par un déclencheur.
      for (const row of rows.slice(1, -1)) {
        const label = row.split(';')[3] ?? '';
        expect(/^"?[=+\-@\t\r]/.test(label)).toBe(false);
      }
    });

    it('shows the account name and validates the period (366 days at most)', async () => {
      const account = (
        await alice
          .post(`/api/spaces/${common}/accounts`)
          .send({
            name: 'Compte commun',
            kind: 'CHECKING',
            openingBalanceCents: 0,
            openingDate: '2026-01-01',
          })
          .expect(201)
      ).body.id as string;
      await alice
        .post(`/api/spaces/${common}/transactions`)
        .send({
          kind: 'EXPENSE',
          bloc: 'COURANT',
          label: 'Marché',
          amountCents: 2450,
          date: '2026-08-15T10:00:00.000Z',
          accountId: account,
        })
        .expect(201);
      const text = (
        await alice.get(csvUrl(common, '2026-08-01', '2026-08-31')).expect(200)
      ).text;
      expect(text).toContain(
        '2026-08-15;Dépense;Courant;Marché;24,50;Compte commun\r\n',
      );

      await alice.get(csvUrl(common, '2026-01-01', '2027-01-01')).expect(200); // 366 jours
      const tooLong = await alice
        .get(csvUrl(common, '2026-01-01', '2027-01-02'))
        .expect(400);
      expect(tooLong.body.message).toContain('366');
      await alice.get(csvUrl(common, '2026-10-31', '2026-10-01')).expect(400);
      await alice.get(csvUrl(common, '2026-02-30', '2026-03-01')).expect(400);
      await alice.get(csvUrl(common, '31/10/2026', '2026-11-01')).expect(400);
      await alice.get(`/api/spaces/${common}/transactions/export`).expect(400);
      await alice
        .get(`/api/spaces/${common}/transactions/export?from=2026-10-01`)
        .expect(400);
    });

    it('does not export the personal space of another member', async () => {
      await alice
        .post(`/api/spaces/${alicePersonal}/transactions`)
        .send({
          kind: 'EXPENSE',
          bloc: 'PLAISIR',
          label: 'Cadeau secret',
          amountCents: 4200,
          date: '2026-10-12T10:00:00.000Z',
        })
        .expect(201);
      await bob
        .get(csvUrl(alicePersonal, '2026-10-01', '2026-10-31'))
        .expect(404);
      const mine = (
        await alice
          .get(csvUrl(alicePersonal, '2026-10-01', '2026-10-31'))
          .expect(200)
      ).text;
      expect(mine).toContain('Cadeau secret;42,00');
      const commonCsv = (
        await bob.get(csvUrl(common, '2026-10-01', '2026-10-31')).expect(200)
      ).text;
      expect(commonCsv).not.toContain('Cadeau secret');
    });
  });

  describe('JSON export', () => {
    it('contains everything the user can read, decrypted, with download headers', async () => {
      await alice
        .put('/api/household/safety-net')
        .send({ savedCents: 550000, asOf: '2026-11-01', targetMonths: 6 })
        .expect(204);
      await alice
        .put('/api/household/fiscal-profile')
        .send({
          childrenUnderSix: 1,
          dependentChildren: 2,
          firstYearHomeServices: false,
        })
        .expect(204);
      const project = (
        await alice
          .post(`/api/spaces/${alicePersonal}/projects`)
          .send({
            name: 'Voyage secret',
            kind: 'HOLIDAY',
            targetCents: 250000,
            targetDate: '2027-07-01',
            startCents: 0,
            startDate: '2026-11-01',
          })
          .expect(201)
      ).body.id as string;
      await alice
        .post(`/api/spaces/${alicePersonal}/projects/${project}/deposits`)
        .send({ date: '2026-11-05', amountCents: 5000, note: 'Note privée' })
        .expect(201);

      const response = await alice.get('/api/export').expect(200);
      expect(response.headers['content-disposition']).toBe(
        'attachment; filename="budget-export-2026-11-12.json"',
      );
      expect(response.headers['content-type']).toContain('application/json');
      const data = response.body;
      expect(data).toMatchObject({
        exportedAt: '2026-11-12T09:30:00.000Z',
        version: 1,
        household: { name: 'Famille', contributionMode: 'PROPORTIONAL' },
        safetyNet: { savedCents: 550000, asOf: '2026-11-01', targetMonths: 6 },
        fiscalProfile: {
          childrenUnderSix: 1,
          dependentChildren: 2,
          firstYearHomeServices: false,
        },
      });
      expect(Object.keys(data).sort()).toEqual([
        'exportedAt',
        'fiscalProfile',
        'household',
        'safetyNet',
        'spaces',
        'version',
      ]);
      expect(
        data.spaces.map((s: { space: { kind: string } }) => s.space.kind),
      ).toEqual(['COMMON', 'PERSONAL']);
      for (const entry of data.spaces) {
        expect(Object.keys(entry).sort()).toEqual([
          'accounts',
          'plan',
          'projects',
          'recurring',
          'reviews',
          'space',
          'transactions',
        ]);
      }
      const [commonEntry, personalEntry] = data.spaces;
      expect(commonEntry.plan).toEqual({
        incomeCents: 380000,
        fixeCents: 175000,
        courantCents: 100000,
        plaisirCents: 45000,
        epargneCents: 20000,
      });
      expect(commonEntry.transactions.length).toBeGreaterThan(8);
      expect(commonEntry.recurring[0]).toMatchObject({
        label: 'Assurance',
        frequency: 'MONTHLY',
      });
      expect(
        commonEntry.reviews.map((r: { month: string }) => r.month),
      ).toContain('2026-10');
      // L'espace personnel est déchiffré, pour son propriétaire.
      expect(personalEntry.transactions[0]).toMatchObject({
        label: 'Cadeau secret',
        amountCents: 4200,
      });
      expect(personalEntry.projects[0]).toMatchObject({
        name: 'Voyage secret',
        targetCents: 250000,
        deposits: [
          { date: '2026-11-05', amountCents: 5000, note: 'Note privée' },
        ],
      });
      expect(personalEntry.reviews[0]).toMatchObject({
        month: '2026-10',
        status: 'DONE',
        answers: { decision: 'Offrir un voyage surprise' },
      });
    });

    it('never includes secrets: keys, tokens, ciphertext, hashes, e-mails', async () => {
      const text = (await alice.get('/api/export').expect(200)).text;
      for (const forbidden of [
        'PERSONAL_DATA_KEY',
        'secret_payload',
        'secretPayload',
        'access_token',
        'refresh_token',
        'password',
        'hash',
        'v1.',
        '@example',
      ]) {
        expect(text).not.toContain(forbidden);
      }
    });

    it('never exposes the personal space of another member', async () => {
      const bobData = (await bob.get('/api/export').expect(200)).body;
      expect(
        bobData.spaces.map((s: { space: { id: string } }) => s.space.id),
      ).toEqual([common, bobPersonal]);
      const text = JSON.stringify(bobData);
      for (const secret of [
        'Cadeau secret',
        'Voyage secret',
        'Note privée',
        'voyage surprise',
        'Prime inattendue',
        alicePersonal,
      ]) {
        expect(text).not.toContain(secret);
      }
      // Et Alice n'a rien de celui de Bob.
      await bob
        .post(`/api/spaces/${bobPersonal}/transactions`)
        .send({
          kind: 'EXPENSE',
          bloc: 'PLAISIR',
          label: 'Cadeau de Bob',
          amountCents: 999,
          date: '2026-10-13T10:00:00.000Z',
        })
        .expect(201);
      expect(
        JSON.stringify((await bob.get('/api/export').expect(200)).body),
      ).toContain('Cadeau de Bob');
      const aliceText = JSON.stringify(
        (await alice.get('/api/export').expect(200)).body,
      );
      expect(aliceText).not.toContain('Cadeau de Bob');
      expect(aliceText).not.toContain(bobPersonal);
    });
  });
});
