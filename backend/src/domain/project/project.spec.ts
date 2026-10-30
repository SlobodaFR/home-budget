import { DomainError } from '../shared/domain-error';
import { Project, ProjectProps } from './project';
import { ProjectDeposit, ProjectDepositProps } from './project-deposit';
import {
  buildProjectView,
  buildProjectViews,
  expectedSavedCents,
  reachedOn,
  summarizeProjects,
} from './project-progress';

const day = (iso: string) => new Date(`${iso}T10:30:00Z`);

const base: ProjectProps = {
  id: 'p1',
  spaceId: 'common',
  name: 'Vacances été 2027',
  kind: 'HOLIDAY',
  targetCents: 300000,
  targetDate: '2027-07-01',
  startCents: 0,
  startDate: '2026-11-01',
  archived: false,
  accountId: null,
};
const proj = (over: Partial<ProjectProps> = {}) =>
  Project.create({ ...base, ...over });

let counter = 0;
const dep = (
  date: string,
  amountCents: number,
  over: Partial<ProjectDepositProps> = {},
) => {
  counter += 1;
  return ProjectDeposit.create({
    id: `d${String(counter).padStart(4, '0')}`,
    projectId: 'p1',
    spaceId: 'common',
    date,
    amountCents,
    note: '',
    ...over,
  });
};

describe('Project', () => {
  it('trims the name and accepts every kind', () => {
    expect(proj({ name: '  Voiture ' }).name).toBe('Voiture');
    for (const kind of [
      'GENERIC',
      'BABY',
      'HOLIDAY',
      'PURCHASE',
      'HOME',
      'EDUCATION',
      'OTHER',
    ] as const) {
      expect(() => proj({ kind })).not.toThrow();
    }
  });

  it.each([
    ['empty name', { name: '  ' }],
    ['name of 81 characters', { name: 'x'.repeat(81) }],
    ['unknown kind', { kind: 'CAR' as never }],
    ['zero target', { targetCents: 0 }],
    ['negative target', { targetCents: -1 }],
    ['fractional target', { targetCents: 10.5 }],
    ['negative start', { startCents: -1 }],
    ['fractional start', { startCents: 0.5 }],
    ['impossible start date', { startDate: '2026-02-30' }],
    ['impossible target date', { targetDate: '2027-13-01' }],
    ['target on the start date', { targetDate: '2026-11-01' }],
    ['target before the start date', { targetDate: '2026-10-31' }],
  ])('rejects %s', (_label, over) => {
    expect(() => proj(over)).toThrow(DomainError);
  });

  it('accepts the boundaries', () => {
    expect(() => proj({ name: 'x'.repeat(80) })).not.toThrow();
    expect(() => proj({ targetCents: 1 })).not.toThrow();
    expect(() => proj({ startCents: 0 })).not.toThrow();
    expect(() => proj({ targetDate: '2026-11-02' })).not.toThrow();
  });
});

describe('ProjectDeposit', () => {
  it('requires a non-zero integer amount, a real date and a short note', () => {
    expect(() => dep('2026-11-05', 1000)).not.toThrow();
    expect(() => dep('2026-11-05', -1000)).not.toThrow();
    expect(() => dep('2026-11-05', 0)).toThrow(DomainError);
    expect(() => dep('2026-11-05', 10.5)).toThrow(DomainError);
    expect(() => dep('2026-02-30', 1000)).toThrow(DomainError);
    expect(() =>
      dep('2026-11-05', 1000, { note: 'x'.repeat(120) }),
    ).not.toThrow();
    expect(() => dep('2026-11-05', 1000, { note: 'x'.repeat(121) })).toThrow(
      DomainError,
    );
    expect(dep('2026-11-05', 1000, { note: '  Prime  ' }).note).toBe('Prime');
  });
});

describe('expectedSavedCents (linear by whole days, rounded)', () => {
  // 1er novembre 2026 -> 1er juillet 2027 : 242 jours.
  it('goes from the start amount to the target', () => {
    const p = proj();
    expect(expectedSavedCents(p, day('2026-11-01'))).toBe(0);
    expect(expectedSavedCents(p, day('2027-07-01'))).toBe(300000);
    // 61 jours : 300 000 × 61 / 242 = 75 619,83
    expect(expectedSavedCents(p, day('2027-01-01'))).toBe(75620);
    // 121 jours : exactement la moitié.
    expect(expectedSavedCents(p, day('2027-03-02'))).toBe(150000);
  });

  it('is bounded before the start and after the target', () => {
    const p = proj({ startCents: 50000 });
    expect(expectedSavedCents(p, day('2026-01-01'))).toBe(50000);
    expect(expectedSavedCents(p, day('2030-01-01'))).toBe(300000);
  });

  it('starts from the amount already saved', () => {
    // 100 000 + (200 000 × 121 / 242)
    expect(
      expectedSavedCents(proj({ startCents: 100000 }), day('2027-03-02')),
    ).toBe(200000);
  });

  it('counts the leap day of February 2028', () => {
    const p = proj({
      startDate: '2028-01-01',
      targetDate: '2028-03-01',
      targetCents: 60000,
    });
    // 60 jours au total (31 + 29) ; le 1er février : 31 jours écoulés.
    expect(expectedSavedCents(p, day('2028-02-01'))).toBe(31000);
  });

  it('expects the target for a project already funded at the start', () => {
    expect(
      expectedSavedCents(proj({ startCents: 300000 }), day('2026-12-01')),
    ).toBe(300000);
    expect(
      expectedSavedCents(proj({ startCents: 400000 }), day('2026-12-01')),
    ).toBe(300000);
  });
});

describe('buildProjectView', () => {
  it('reproduces the contract example on the start date (8 months left, 32 500 per month)', () => {
    const view = buildProjectView(
      proj(),
      [dep('2026-11-01', 40000)],
      day('2026-11-01'),
    );
    expect(view).toMatchObject({
      savedCents: 40000,
      remainingCents: 260000,
      progressPercent: 13, // 13,33
      monthsLeft: 8,
      monthlyNeededCents: 32500,
      expectedSavedCents: 0, // startDate = aujourd'hui
      status: 'AHEAD', // 40 000 >= 0 + 15 000
    });
  });

  it('is BEHIND when far below the linear pace and recomputes the monthly need', () => {
    const view = buildProjectView(
      proj(),
      [dep('2026-11-05', 40000)],
      day('2027-01-01'),
    );
    expect(view).toMatchObject({
      monthsLeft: 6,
      expectedSavedCents: 75620,
      status: 'BEHIND',
      // 260 000 / 6 = 43 333,33 -> arrondi supérieur
      monthlyNeededCents: 43334,
    });
  });

  it('applies the 5 % tolerance on integers, borders included', () => {
    // Attendu au 1er janvier : 75 620 ; tolérance : 5 % de 300 000 = 15 000.
    const status = (saved: number) =>
      buildProjectView(
        proj(),
        saved === 0 ? [] : [dep('2026-12-01', saved)],
        day('2027-01-01'),
      ).status;
    expect(status(90620)).toBe('AHEAD'); // attendu + 15 000 : atteint
    expect(status(90619)).toBe('ON_TRACK');
    expect(status(75620)).toBe('ON_TRACK');
    expect(status(60620)).toBe('ON_TRACK'); // attendu − 15 000 : pas encore en retard
    expect(status(60619)).toBe('BEHIND');
    expect(status(0)).toBe('BEHIND');
  });

  it('is DONE exactly at the target, with no remaining and no monthly need', () => {
    const exact = buildProjectView(
      proj(),
      [dep('2026-12-01', 300000)],
      day('2027-01-01'),
    );
    expect(exact).toMatchObject({
      status: 'DONE',
      savedCents: 300000,
      remainingCents: 0,
      progressPercent: 100,
      monthlyNeededCents: 0,
    });
    const one = buildProjectView(
      proj(),
      [dep('2026-12-01', 299999)],
      day('2027-01-01'),
    );
    expect(one).toMatchObject({
      status: expect.not.stringMatching('DONE'),
      remainingCents: 1,
      progressPercent: 99, // 99,9996 : arrondi inférieur
      monthlyNeededCents: 1,
    });
    const over = buildProjectView(
      proj(),
      [dep('2026-12-01', 350000)],
      day('2027-01-01'),
    );
    expect(over).toMatchObject({
      status: 'DONE',
      remainingCents: 0,
      progressPercent: 100,
    });
    // Même passé l'échéance, un objectif atteint reste DONE.
    expect(
      buildProjectView(proj(), [dep('2026-12-01', 300000)], day('2028-01-01'))
        .status,
    ).toBe('DONE');
  });

  it('is LATE once the target date has passed, not on the day itself', () => {
    const view = (today: string) =>
      buildProjectView(proj(), [dep('2026-12-01', 100000)], day(today));
    expect(view('2027-07-01').status).not.toBe('LATE');
    expect(view('2027-07-02')).toMatchObject({
      status: 'LATE',
      monthsLeft: 0,
      remainingCents: 200000,
      monthlyNeededCents: 200000, // tout le reste d'un coup
    });
  });

  it('counts whole months with the day clamped to the end of the month', () => {
    const months = (
      today: string,
      targetDate: string,
      startDate = '2026-01-01',
    ) =>
      buildProjectView(proj({ targetDate, startDate }), [], day(today))
        .monthsLeft;
    expect(months('2026-11-01', '2027-07-01')).toBe(8);
    expect(months('2027-06-01', '2027-07-01')).toBe(1);
    expect(months('2027-06-02', '2027-07-01')).toBe(0); // dans le mois
    expect(months('2027-06-15', '2027-07-01')).toBe(0);
    expect(months('2027-07-01', '2027-07-01')).toBe(0); // aujourd'hui
    expect(months('2027-08-01', '2027-07-01')).toBe(0); // passée
    expect(months('2027-01-31', '2027-02-28')).toBe(1); // 31 janv. -> 28 févr.
    expect(months('2028-01-31', '2028-02-29')).toBe(1);
    expect(months('2026-10-30', '2027-10-15')).toBe(11);
  });

  it('divides by at least one month when the deadline is within the month', () => {
    const view = buildProjectView(
      proj(),
      [dep('2027-01-01', 100000)],
      day('2027-06-20'),
    );
    expect(view.monthsLeft).toBe(0);
    expect(view.monthlyNeededCents).toBe(200000);
  });

  it('handles a start date today, and one in the future', () => {
    const today = buildProjectView(
      proj({ startDate: '2026-11-12' }),
      [],
      day('2026-11-12'),
    );
    expect(today.expectedSavedCents).toBe(0);
    expect(today.status).toBe('ON_TRACK'); // 0 épargné, 0 attendu
    const future = buildProjectView(
      proj({ startDate: '2027-01-01', startCents: 20000 }),
      [],
      day('2026-11-12'),
    );
    expect(future.expectedSavedCents).toBe(20000);
    expect(future.savedCents).toBe(20000);
    expect(future.status).toBe('ON_TRACK');
    expect(future.monthsLeft).toBe(7);
  });

  it('adds the start amount to the deposits and handles withdrawals', () => {
    const view = buildProjectView(
      proj({ startCents: 50000 }),
      [dep('2026-11-02', 30000), dep('2026-11-20', -10000)],
      day('2026-12-01'),
    );
    expect(view.savedCents).toBe(70000);
    // Un retrait qui rendrait l'épargne négative est refusé ailleurs ; la vue ne descend jamais sous 0.
    const broken = buildProjectView(
      proj(),
      [dep('2026-11-20', -10000)],
      day('2026-12-01'),
    );
    expect(broken.savedCents).toBe(0);
    expect(broken.progressPercent).toBe(0);
  });

  it('treats a project funded from the start as DONE, reached on its start date', () => {
    const view = buildProjectView(
      proj({ startCents: 300000 }),
      [],
      day('2026-12-01'),
    );
    expect(view).toMatchObject({ status: 'DONE', reachedOn: '2026-11-01' });
  });
});

describe('reachedOn', () => {
  const small = proj({ targetCents: 100000 });

  it('is the date of the deposit that reached the target', () => {
    expect(
      reachedOn(small, [dep('2026-11-05', 60000), dep('2026-12-01', 50000)]),
    ).toBe('2026-12-01');
    expect(reachedOn(small, [dep('2026-11-05', 60000)])).toBeNull();
    // Atteint exactement.
    expect(reachedOn(small, [dep('2026-11-05', 100000)])).toBe('2026-11-05');
    expect(reachedOn(small, [dep('2026-11-05', 99999)])).toBeNull();
  });

  it('forgets a date lost by a withdrawal and keeps the last crossing', () => {
    const deposits = [
      dep('2026-11-05', 60000),
      dep('2026-12-01', 50000), // 110 000 : atteint
      dep('2026-12-10', -20000), // 90 000 : perdu
    ];
    expect(reachedOn(small, deposits)).toBeNull();
    expect(reachedOn(small, [...deposits, dep('2026-12-20', 15000)])).toBe(
      '2026-12-20',
    );
    // Un versement de plus une fois atteint ne change pas la date.
    expect(
      reachedOn(small, [dep('2026-11-05', 100000), dep('2026-11-09', 5000)]),
    ).toBe('2026-11-05');
  });

  it('replays deposits by date, not by insertion order', () => {
    expect(
      reachedOn(small, [dep('2026-12-01', 50000), dep('2026-11-05', 60000)]),
    ).toBe('2026-12-01');
  });
});

describe('buildProjectViews and summarizeProjects', () => {
  const a = proj({ id: 'a', name: 'Voiture', targetDate: '2027-12-01' });
  const b = proj({
    id: 'b',
    name: 'Naissance',
    targetDate: '2027-03-01',
    targetCents: 100000,
  });
  const c = proj({
    id: 'c',
    name: 'Ancien',
    targetDate: '2026-12-01',
    archived: true,
  });

  it('lists active projects first, by target date, then archived ones', () => {
    const views = buildProjectViews([a, b, c], [], day('2026-11-12'));
    expect(views.map((v) => v.project.name)).toEqual([
      'Naissance',
      'Voiture',
      'Ancien',
    ]);
  });

  it('only attaches each deposit to its own project', () => {
    const views = buildProjectViews(
      [a, b],
      [
        dep('2026-11-05', 10000, { projectId: 'a' }),
        dep('2026-11-06', 5000, { projectId: 'b' }),
      ],
      day('2026-11-12'),
    );
    const saved = Object.fromEntries(
      views.map((v) => [v.project.id, v.savedCents]),
    );
    expect(saved).toEqual({ a: 10000, b: 5000 });
  });

  it('sums the monthly needs of active, unfinished projects against the planned savings', () => {
    // Au 1er novembre 2026 : voiture 300 000 sur 13 mois, naissance 100 000 sur 4 mois.
    const views = buildProjectViews([a, b, c], [], day('2026-11-01'));
    // ceil(300 000 / 13) = 23 077 ; ceil(100 000 / 4) = 25 000 ; l'archivé est ignoré.
    expect(summarizeProjects(views, 40000)).toEqual({
      totalMonthlyNeededCents: 48077,
      plannedEpargneCents: 40000,
      gapCents: 8077,
      activeCount: 2,
    });
    expect(summarizeProjects(views, 48077).gapCents).toBe(0);
    expect(summarizeProjects(views, 100000).gapCents).toBe(0);
  });

  it('ignores reached projects and handles an empty list', () => {
    const done = buildProjectViews(
      [b],
      [dep('2026-11-02', 100000, { projectId: 'b' })],
      day('2026-11-12'),
    );
    expect(summarizeProjects(done, 0)).toEqual({
      totalMonthlyNeededCents: 0,
      plannedEpargneCents: 0,
      gapCents: 0,
      activeCount: 0,
    });
    expect(summarizeProjects([], 20000).gapCents).toBe(0);
  });

  it('adds up the contract example (61 500 needed, 50 000 planned, 11 500 gap)', () => {
    const x = proj({
      id: 'x',
      targetCents: 3 * 32500 * 4,
      targetDate: '2027-03-01',
    });
    const views = buildProjectViews(
      [x, proj({ id: 'y', targetCents: 29000 * 4, targetDate: '2027-03-01' })],
      [],
      day('2026-11-01'),
    );
    // Chacun sur 4 mois : 390 000 / 4 = 97 500 et 116 000 / 4 = 29 000 -> on vérifie la somme arrondie.
    expect(summarizeProjects(views, 50000)).toMatchObject({
      totalMonthlyNeededCents: 97500 + 29000,
      gapCents: 97500 + 29000 - 50000,
      activeCount: 2,
    });
  });
});
