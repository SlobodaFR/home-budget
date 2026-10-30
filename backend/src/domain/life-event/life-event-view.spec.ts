import {
  CatalogStep,
  LIFE_EVENT_CATALOG,
  LifeEventDefinition,
} from './catalog';
import { LifeEvent } from './life-event';
import {
  DUE_SOON_DAYS,
  buildLifeEventView,
  dueDateOf,
  stepStatus,
} from './life-event-view';

const step = (
  id: string,
  dueOffsetDays: number | null,
  over: Partial<CatalogStep> = {},
): CatalogStep => ({
  id,
  title: id,
  detail: `détail ${id}`,
  category: 'ADMIN',
  dueOffsetDays,
  dueLabel: dueOffsetDays === null ? null : `J+${dueOffsetDays}`,
  sourceLabel: 'service-public.gouv.fr',
  sourceUrl: 'https://www.service-public.gouv.fr/x',
  verifiedOn: '2026-10-30',
  link: null,
  ...over,
});

const definition = (steps: CatalogStep[]): LifeEventDefinition => ({
  type: 'BIRTH',
  label: "Naissance d'un enfant",
  description: 'test',
  steps,
});

const event = (eventDate = '2026-11-10') =>
  LifeEvent.create({
    id: 'e1',
    householdId: 'h1',
    type: 'BIRTH',
    label: 'Bébé',
    eventDate,
    createdAt: new Date('2026-10-30T10:00:00Z'),
    progress: [],
  });

describe('dueDateOf', () => {
  it('adds whole days in the UTC calendar, across months, years and leap days', () => {
    expect(dueDateOf('2026-10-31', 5)).toBe('2026-11-05');
    expect(dueDateOf('2026-12-30', 5)).toBe('2027-01-04');
    expect(dueDateOf('2028-02-27', 2)).toBe('2028-02-29');
    expect(dueDateOf('2026-11-10', -31)).toBe('2026-10-10');
    expect(dueDateOf('2026-11-10', 0)).toBe('2026-11-10');
    expect(dueDateOf('2026-11-10', null)).toBeNull();
  });
});

describe('stepStatus', () => {
  const today = '2026-11-10';

  it('is DONE whatever the deadline', () => {
    expect(stepStatus(true, '2020-01-01', today)).toBe('DONE');
    expect(stepStatus(true, null, today)).toBe('DONE');
  });

  it('is NO_DATE without deadline', () => {
    expect(stepStatus(false, null, today)).toBe('NO_DATE');
  });

  it('is OVERDUE the day after the deadline, DUE_SOON on the deadline itself', () => {
    expect(stepStatus(false, '2026-11-09', today)).toBe('OVERDUE');
    expect(stepStatus(false, '2026-11-10', today)).toBe('DUE_SOON');
  });

  it('is DUE_SOON up to 14 days ahead included, UPCOMING from the 15th day', () => {
    expect(DUE_SOON_DAYS).toBe(14);
    expect(stepStatus(false, '2026-11-24', today)).toBe('DUE_SOON');
    expect(stepStatus(false, '2026-11-25', today)).toBe('UPCOMING');
  });

  it('counts calendar days across a month and a year boundary', () => {
    expect(stepStatus(false, '2027-01-01', '2026-12-18')).toBe('DUE_SOON');
    expect(stepStatus(false, '2027-01-02', '2026-12-18')).toBe('UPCOMING');
    expect(stepStatus(false, '2026-12-31', '2027-01-01')).toBe('OVERDUE');
  });
});

describe('buildLifeEventView', () => {
  const now = new Date('2026-11-12T09:30:00Z');

  it('computes due dates, statuses and the requested order', () => {
    const def = definition([
      step('later', 60),
      step('free-1', null),
      step('overdue-old', -5),
      step('soon', 5),
      step('overdue-recent', 1),
      step('free-2', null),
      step('done-early', 0),
    ]);
    const view = buildLifeEventView(
      event('2026-11-10').withStep('done-early', true, now),
      def,
      now,
    );
    expect(view.steps.map((s) => [s.stepId, s.status, s.dueDate])).toEqual([
      ['overdue-old', 'OVERDUE', '2026-11-05'],
      ['overdue-recent', 'OVERDUE', '2026-11-11'],
      ['soon', 'DUE_SOON', '2026-11-15'],
      ['later', 'UPCOMING', '2027-01-09'],
      ['free-1', 'NO_DATE', null],
      ['free-2', 'NO_DATE', null],
      ['done-early', 'DONE', '2026-11-10'],
    ]);
  });

  it('computes progress as a floored percentage', () => {
    const def = definition([step('a', null), step('b', null), step('c', null)]);
    const none = buildLifeEventView(event(), def, now);
    expect([none.doneCount, none.totalCount, none.progressPercent]).toEqual([
      0, 3, 0,
    ]);
    const one = buildLifeEventView(event().withStep('a', true, now), def, now);
    expect(one.progressPercent).toBe(33);
    const two = buildLifeEventView(
      event().withStep('a', true, now).withStep('b', true, now),
      def,
      now,
    );
    expect(two.progressPercent).toBe(66);
    const all = buildLifeEventView(
      event()
        .withStep('a', true, now)
        .withStep('b', true, now)
        .withStep('c', true, now),
      def,
      now,
    );
    expect(all.progressPercent).toBe(100);
    expect(
      buildLifeEventView(event(), definition([]), now).progressPercent,
    ).toBe(0);
  });

  it('shows a step added to the catalog later, and forgets a removed one, keeping the done state by stepId', () => {
    const v1 = definition([step('a', null), step('b', null)]);
    const saved = event().withStep('a', true, now).withStep('gone', true, now);
    const view1 = buildLifeEventView(saved, v1, now);
    expect(view1.steps.map((s) => [s.stepId, s.status])).toEqual([
      ['b', 'NO_DATE'],
      ['a', 'DONE'],
    ]);

    const v2 = definition([step('a', null), step('b', null), step('new', 30)]);
    const view2 = buildLifeEventView(saved, v2, now);
    expect(view2.totalCount).toBe(3);
    expect(view2.doneCount).toBe(1);
    expect(view2.steps.find((s) => s.stepId === 'new')).toMatchObject({
      status: 'UPCOMING',
      doneAt: null,
    });
    // « gone » n'est plus au catalogue : il ne compte plus nulle part.
    expect(view2.steps.some((s) => s.stepId === 'gone')).toBe(false);
  });

  it('recomputes the deadlines when the date changes, and keeps what is done', () => {
    const def = definition([step('a', 5), step('b', 5)]);
    const saved = event('2026-11-10').withStep('a', true, now);
    const moved = saved.withDetails('Bébé', '2027-02-01');
    const view = buildLifeEventView(moved, def, now);
    expect(view.steps.map((s) => [s.stepId, s.dueDate, s.status])).toEqual([
      ['b', '2027-02-06', 'UPCOMING'],
      ['a', '2027-02-06', 'DONE'],
    ]);
  });

  it('exposes the done instant, the note and the source of each step', () => {
    const def = definition([step('a', null, { link: '/aides' })]);
    const view = buildLifeEventView(
      event().withStep('a', true, now, 'fait'),
      def,
      now,
    );
    expect(view.steps[0]).toEqual({
      stepId: 'a',
      title: 'a',
      detail: 'détail a',
      category: 'ADMIN',
      dueDate: null,
      dueLabel: null,
      status: 'DONE',
      doneAt: '2026-11-12T09:30:00.000Z',
      note: 'fait',
      sourceLabel: 'service-public.gouv.fr',
      sourceUrl: 'https://www.service-public.gouv.fr/x',
      link: '/aides',
    });
  });

  it('builds the view of the real BIRTH catalog without error', () => {
    const [birth] = LIFE_EVENT_CATALOG;
    const view = buildLifeEventView(event('2026-11-10'), birth, now);
    expect(view.totalCount).toBe(birth.steps.length);
    expect(
      view.steps.find((s) => s.stepId === 'birth-declaration'),
    ).toMatchObject({
      dueDate: '2026-11-15',
      status: 'DUE_SOON',
    });
  });
});
