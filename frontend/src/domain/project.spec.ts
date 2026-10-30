import { describe, expect, it } from 'vitest';
import {
  activeProjects,
  archivedProjects,
  behindCents,
  buildDepositPayload,
  buildProjectPayload,
  closestProjects,
  DepositFormValues,
  describeCalculation,
  describeDeadline,
  describeMonthlyNeed,
  describeProgress,
  describeSummaryGap,
  emptyDepositForm,
  emptyProjectForm,
  expectedPercent,
  parseDeposits,
  parseProject,
  parseProjects,
  parseProjectsSummary,
  Project,
  ProjectFormValues,
  projectToForm,
  projectToPayload,
  sortDeposits,
  sortProjects,
  STATUS_INFO,
} from './project';

const NOW = new Date(2026, 9, 30, 9, 0, 0);

/** Les montants formatés contiennent des espaces insécables : on les ramène à des espaces simples. */
const plain = (value: string | undefined) => (value ?? '').replace(/[\s\u00a0\u202f]/g, ' ');

const project = (overrides: Partial<Project> = {}): Project => ({
  id: 'p1',
  spaceId: 's1',
  name: 'Vacances été 2027',
  kind: 'HOLIDAY',
  targetCents: 300000,
  targetDate: '2027-07-01',
  startCents: 0,
  startDate: '2026-11-01',
  savedCents: 40000,
  remainingCents: 260000,
  progressPercent: 13,
  monthsLeft: 8,
  monthlyNeededCents: 32500,
  status: 'BEHIND',
  expectedSavedCents: 75000,
  archived: false,
  accountId: null,
  ...overrides,
});

const form = (overrides: Partial<ProjectFormValues> = {}): ProjectFormValues => ({
  ...emptyProjectForm(NOW),
  name: ' Vacances ',
  target: '3 000',
  ...overrides,
});

describe('parseProject', () => {
  it('reads the contract', () => {
    const raw = { ...project(), spaceId: 's1' };
    expect(parseProject(raw)).toEqual(project());
  });

  it('rejects a project without id, name or target', () => {
    expect(parseProject(null)).toBeNull();
    expect(parseProject({ id: 'x', name: 'n' })).toBeNull();
    expect(parseProject({ id: 'x', targetCents: 100 })).toBeNull();
    expect(parseProject({ name: 'n', targetCents: 100 })).toBeNull();
  });

  it('recomputes what the server forgot instead of guessing', () => {
    const parsed = parseProject({ id: 'x', name: 'Voiture', targetCents: 100000, startCents: 10000, monthsLeft: 4, targetDate: '2027-03-01' });
    expect(parsed).toMatchObject({
      savedCents: 10000,
      remainingCents: 90000,
      progressPercent: 10,
      monthlyNeededCents: 22500,
      status: 'ON_TRACK',
      kind: 'GENERIC',
      archived: false,
      accountId: null,
      expectedSavedCents: 10000,
    });
  });

  it('reads a reached project as done when no status is sent', () => {
    expect(parseProject({ id: 'x', name: 'n', targetCents: 100, savedCents: 150 })).toMatchObject({ status: 'DONE', remainingCents: 0, monthlyNeededCents: 0, progressPercent: 100 });
  });

  it('clamps the progress and ignores an unknown kind or status', () => {
    expect(parseProject({ ...project(), progressPercent: 140, kind: 'ROCKET', status: 'MAYBE' })).toMatchObject({ progressPercent: 100, kind: 'GENERIC', status: 'ON_TRACK' });
  });

  it('survives garbage in a list and sorts it', () => {
    const list = parseProjects([null, 3, { id: 'a' }, project({ id: 'late', targetDate: '2028-01-01' }), project({ id: 'soon', targetDate: '2027-01-01' })]);
    expect(list.map((entry) => entry.id)).toEqual(['soon', 'late']);
    expect(parseProjects('nope')).toEqual([]);
  });
});

describe('parseProjectsSummary and parseDeposits', () => {
  it('reads the summary and recomputes a missing gap', () => {
    expect(parseProjectsSummary({ totalMonthlyNeededCents: 61500, plannedEpargneCents: 50000, gapCents: 11500, activeCount: 2 })).toEqual({
      totalMonthlyNeededCents: 61500,
      plannedEpargneCents: 50000,
      gapCents: 11500,
      activeCount: 2,
    });
    expect(parseProjectsSummary({ totalMonthlyNeededCents: 100, plannedEpargneCents: 300 }).gapCents).toBe(0);
    expect(parseProjectsSummary({ totalMonthlyNeededCents: 500, plannedEpargneCents: 300 }).gapCents).toBe(200);
    expect(parseProjectsSummary(null)).toEqual({ totalMonthlyNeededCents: 0, plannedEpargneCents: 0, gapCents: 0, activeCount: 0 });
  });

  it('reads deposits, drops unreadable ones and puts the most recent first', () => {
    const deposits = parseDeposits([
      { id: 'a', date: '2026-10-01', amountCents: 20000, note: 'Prime' },
      { id: 'b', date: '2026-11-15', amountCents: -5000 },
      { id: 'c', date: 'bad', amountCents: 1 },
      { date: '2026-11-01', amountCents: 1 },
      null,
    ]);
    expect(deposits).toEqual([
      { id: 'b', date: '2026-11-15', amountCents: -5000, note: '' },
      { id: 'a', date: '2026-10-01', amountCents: 20000, note: 'Prime' },
    ]);
    expect(parseDeposits(undefined)).toEqual([]);
  });

  it('sorts deposits by date, newest first, keeping the order of equal dates', () => {
    const sorted = sortDeposits([
      { id: '1', date: '2026-01-01', amountCents: 1, note: '' },
      { id: '2', date: '2026-03-01', amountCents: 1, note: '' },
      { id: '3', date: '2026-03-01', amountCents: 1, note: '' },
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(['2', '3', '1']);
  });
});

describe('grouping', () => {
  const list = [
    project({ id: 'archived', archived: true, targetDate: '2026-12-01' }),
    project({ id: 'later', targetDate: '2028-01-01' }),
    project({ id: 'done', status: 'DONE', targetDate: '2027-01-01' }),
    project({ id: 'soon', targetDate: '2027-02-01' }),
    project({ id: 'nodate', targetDate: '' }),
    project({ id: 'mid', targetDate: '2027-06-01' }),
  ];

  it('sorts active first, then by due date, unreadable dates last', () => {
    expect(sortProjects(list).map((entry) => entry.id)).toEqual(['done', 'soon', 'mid', 'later', 'nodate', 'archived']);
  });

  it('splits active and archived', () => {
    expect(activeProjects(list)).toHaveLength(5);
    expect(archivedProjects(list).map((entry) => entry.id)).toEqual(['archived']);
  });

  it('picks the closest unfinished projects for the home page', () => {
    expect(closestProjects(list).map((entry) => entry.id)).toEqual(['soon', 'mid', 'later']);
    expect(closestProjects(list, 2).map((entry) => entry.id)).toEqual(['soon', 'mid']);
    expect(closestProjects([project({ archived: true }), project({ status: 'DONE' })])).toEqual([]);
  });
});

describe('wording', () => {
  it('writes the progress as « 13 % — 400 € sur 3 000 € »', () => {
    expect(plain(describeProgress(project()))).toBe('13 % — 400 € sur 3 000 €');
    expect(plain(describeProgress(project({ savedCents: 1250, progressPercent: 0 })))).toBe('0 % — 12,50 € sur 3 000 €');
  });

  it('places the expected progress on the bar', () => {
    expect(expectedPercent(project())).toBe(25);
    expect(expectedPercent(project({ expectedSavedCents: 999999 }))).toBe(100);
    expect(expectedPercent(project({ targetCents: 0 }))).toBe(0);
  });

  it('says how far behind a project is, only when it is', () => {
    expect(behindCents(project())).toBe(35000);
    expect(behindCents(project({ status: 'LATE', savedCents: 40000, expectedSavedCents: 300000 }))).toBe(260000);
    expect(behindCents(project({ status: 'ON_TRACK' }))).toBe(0);
    expect(behindCents(project({ status: 'AHEAD', savedCents: 200000 }))).toBe(0);
  });

  it('describes the deadline', () => {
    expect(describeDeadline(project())).toMatch(/^Échéance le 1(er)? juillet 2027 · dans 8 mois$/);
    expect(describeDeadline(project({ monthsLeft: 0 }))).toMatch(/ce mois-ci$/);
    expect(describeDeadline(project({ status: 'LATE', monthsLeft: 0 }))).toMatch(/^Échéance dépassée \(1 juil\.? 2027\)$/);
    expect(describeDeadline(project({ status: 'DONE', monthsLeft: 0 }))).toMatch(/^Échéance le 1(er)? juillet 2027$/);
    expect(describeDeadline(project({ targetDate: '' }))).toBe('Échéance inconnue');
  });

  it('says how much to set aside each month', () => {
    expect(plain(describeMonthlyNeed(project()))).toBe('Il faut mettre de côté 325 € par mois.');
    expect(describeMonthlyNeed(project({ status: 'DONE', remainingCents: 0, monthlyNeededCents: 0 }))).toMatch(/atteint/);
    expect(plain(describeMonthlyNeed(project({ status: 'LATE', remainingCents: 260000 })))).toMatch(/Il reste 2 600 € à réunir/);
  });

  it('spells out the calculation, with at least one month', () => {
    expect(plain(describeCalculation(project()))).toBe('(3 000 € − 400 €) ÷ 8 mois = 325 € par mois');
    expect(plain(describeCalculation(project({ monthsLeft: 0, monthlyNeededCents: 260000 })))).toMatch(/÷ 1 mois = 2 600 € par mois$/);
  });

  it('labels every status in words', () => {
    expect(Object.values(STATUS_INFO).map((info) => info.label)).toEqual(['Atteint', 'En avance', 'À jour', 'En retard', 'En retard sur l’échéance']);
  });

  it('writes the summary gap in plain French', () => {
    expect(describeSummaryGap({ gapCents: 11500, activeCount: 2 })).toMatchObject({ gap: true });
    expect(plain(describeSummaryGap({ gapCents: 11500, activeCount: 2 })?.text)).toBe('Il manque 115 €/mois dans votre plan d’épargne');
    expect(describeSummaryGap({ gapCents: 0, activeCount: 1 })).toEqual({ gap: false, text: 'Votre plan d’épargne couvre vos projets.' });
    expect(describeSummaryGap({ gapCents: 500, activeCount: 0 })).toBeNull();
  });
});

describe('buildProjectPayload', () => {
  it('builds a payload in cents', () => {
    expect(buildProjectPayload(form({ start: '400,50', targetDate: '2027-07-01' }))).toEqual({
      ok: true,
      payload: { name: 'Vacances', kind: 'OTHER', targetCents: 300000, targetDate: '2027-07-01', startCents: 40050, startDate: '2026-10-30' },
    });
  });

  it('starts from zero when the savings field is empty', () => {
    const result = buildProjectPayload(form({ start: '  ' }));
    expect(result.ok && result.payload.startCents).toBe(0);
  });

  it('rejects an empty or too long name (1 to 80)', () => {
    expect(buildProjectPayload(form({ name: ' ' }))).toMatchObject({ ok: false, errors: { name: expect.any(String) } });
    expect(buildProjectPayload(form({ name: 'x'.repeat(81) }))).toMatchObject({ ok: false, errors: { name: expect.any(String) } });
    expect(buildProjectPayload(form({ name: 'x'.repeat(80) })).ok).toBe(true);
  });

  it('rejects an empty, invalid or zero target', () => {
    for (const target of ['', 'abc', '0', '-5', '1,234']) {
      expect(buildProjectPayload(form({ target }))).toMatchObject({ ok: false, errors: { target: expect.any(String) } });
    }
  });

  it('rejects an invalid or negative starting amount', () => {
    for (const start of ['abc', '-5', '1,234']) {
      expect(buildProjectPayload(form({ start }))).toMatchObject({ ok: false, errors: { start: expect.any(String) } });
    }
  });

  it('requires a due date strictly after the start date', () => {
    expect(buildProjectPayload(form({ targetDate: '2026-10-30' }))).toMatchObject({ ok: false, errors: { targetDate: expect.stringContaining('après') } });
    expect(buildProjectPayload(form({ targetDate: '2026-10-29' }))).toMatchObject({ ok: false, errors: { targetDate: expect.stringContaining('après') } });
    expect(buildProjectPayload(form({ targetDate: '2026-10-31' })).ok).toBe(true);
  });

  it('rejects invalid dates', () => {
    expect(buildProjectPayload(form({ startDate: '' }))).toMatchObject({ ok: false, errors: { startDate: expect.any(String) } });
    expect(buildProjectPayload(form({ targetDate: '2027-02-30' }))).toMatchObject({ ok: false, errors: { targetDate: expect.any(String) } });
  });

  it('reports every error at once', () => {
    const result = buildProjectPayload(form({ name: '', target: '', start: 'x' }));
    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual(['name', 'start', 'target']);
  });

  it('sends the chosen account, null for « Aucun » in a shown selector, nothing otherwise', () => {
    const chosen = buildProjectPayload(form({ accountId: 'acc-1' }));
    expect(chosen.ok && chosen.payload.accountId).toBe('acc-1');
    const none = buildProjectPayload(form(), { accountSelectable: true });
    expect(none.ok && none.payload.accountId).toBeNull();
    const absent = buildProjectPayload(form());
    expect(absent.ok && 'accountId' in absent.payload).toBe(false);
  });

  it('defaults to a one year horizon, kind « Autre » and today as the start', () => {
    expect(emptyProjectForm(NOW)).toMatchObject({ kind: 'OTHER', startDate: '2026-10-30', targetDate: '2027-10-30', name: '', target: '', start: '' });
  });

  it('round-trips an existing project through the form', () => {
    const original = project({ startCents: 12345, accountId: 'acc-1' });
    expect(projectToForm(original)).toMatchObject({ target: '3000', start: '123,45', accountId: 'acc-1' });
    expect(buildProjectPayload(projectToForm(original))).toMatchObject({
      ok: true,
      payload: { targetCents: 300000, startCents: 12345, targetDate: '2027-07-01', startDate: '2026-11-01', accountId: 'acc-1' },
    });
  });

  it('keeps everything, account included, when archiving', () => {
    expect(projectToPayload(project({ accountId: 'acc-1' }), { archived: true })).toEqual({
      name: 'Vacances été 2027',
      kind: 'HOLIDAY',
      targetCents: 300000,
      targetDate: '2027-07-01',
      startCents: 0,
      startDate: '2026-11-01',
      accountId: 'acc-1',
      archived: true,
    });
  });
});

describe('buildDepositPayload', () => {
  const deposit = (overrides: Partial<DepositFormValues> = {}): DepositFormValues => ({ ...emptyDepositForm(NOW), amount: '200', ...overrides });

  it('builds a deposit in cents with today as the default date', () => {
    expect(buildDepositPayload(deposit())).toEqual({ ok: true, payload: { date: '2026-10-30', amountCents: 20000 } });
  });

  it('turns a withdrawal into a negative amount and keeps the note trimmed', () => {
    expect(buildDepositPayload(deposit({ mode: 'WITHDRAW', amount: '50,5', note: ' Réparation ' }), { savedCents: 100000 })).toEqual({
      ok: true,
      payload: { date: '2026-10-30', amountCents: -5050, note: 'Réparation' },
    });
  });

  it('rejects an empty, invalid, negative or zero amount', () => {
    for (const amount of ['', 'abc', '0', '-50', '1,234']) {
      expect(buildDepositPayload(deposit({ amount }))).toMatchObject({ ok: false, errors: { amount: expect.any(String) } });
    }
  });

  it('refuses to withdraw more than what is saved, but not to withdraw everything', () => {
    expect(buildDepositPayload(deposit({ mode: 'WITHDRAW', amount: '400,01' }), { savedCents: 40000 })).toMatchObject({
      ok: false,
      errors: { amount: expect.stringMatching(/plus que ce qui est épargné \(400[\s\u00a0\u202f]€\)/) },
    });
    expect(buildDepositPayload(deposit({ mode: 'WITHDRAW', amount: '400' }), { savedCents: 40000 }).ok).toBe(true);
    expect(buildDepositPayload(deposit({ mode: 'ADD', amount: '9999' }), { savedCents: 0 }).ok).toBe(true);
  });

  it('rejects an invalid date and a note over 120 characters', () => {
    expect(buildDepositPayload(deposit({ date: '' }))).toMatchObject({ ok: false, errors: { date: expect.any(String) } });
    expect(buildDepositPayload(deposit({ note: 'x'.repeat(121) }))).toMatchObject({ ok: false, errors: { note: expect.any(String) } });
    expect(buildDepositPayload(deposit({ note: 'x'.repeat(120) })).ok).toBe(true);
  });
});
