import { rec, tx } from '../../testing/builders';
import { SpacePlan } from '../space/space-plan';
import {
  buildForecast,
  expandOccurrences,
  labelsAreNeighbours,
  matchOccurrences,
  monthPhase,
} from './forecast';

const PLAN = SpacePlan.create({
  incomeCents: 380000,
  fixeCents: 175000,
  courantCents: 100000,
  plaisirCents: 45000,
  epargneCents: 20000,
});
const TODAY = new Date('2026-11-12T15:30:00Z');

function days(month: string, ...items: ReturnType<typeof rec>[]) {
  return expandOccurrences(items, month).map((o) =>
    o.date.toISOString().slice(0, 10),
  );
}

describe('monthPhase', () => {
  it('distinguishes past, current and future months', () => {
    expect(monthPhase('2026-10', TODAY)).toBe('PAST');
    expect(monthPhase('2026-11', TODAY)).toBe('CURRENT');
    expect(monthPhase('2026-12', TODAY)).toBe('FUTURE');
  });

  it('treats the first and the last instant of a month as current', () => {
    expect(monthPhase('2026-11', new Date('2026-11-01T00:00:00Z'))).toBe(
      'CURRENT',
    );
    expect(monthPhase('2026-11', new Date('2026-11-30T23:59:59Z'))).toBe(
      'CURRENT',
    );
    expect(monthPhase('2026-11', new Date('2026-12-01T00:00:00Z'))).toBe(
      'PAST',
    );
  });
});

describe('expandOccurrences', () => {
  it('falls back to the last day when the day exceeds the month length', () => {
    const d31 = rec('EXPENSE', 'FIXE', 'Prêt', 100, { dayOfMonth: 31 });
    const d30 = rec('EXPENSE', 'FIXE', 'Prêt bis', 100, { dayOfMonth: 30 });
    const d29 = rec('EXPENSE', 'FIXE', 'Prêt ter', 100, { dayOfMonth: 29 });
    expect(days('2026-02', d31, d30, d29)).toEqual([
      '2026-02-28',
      '2026-02-28',
      '2026-02-28',
    ]);
    // 2028 est bissextile.
    expect(days('2028-02', d31)).toEqual(['2028-02-29']);
    expect(days('2028-02', d30)).toEqual(['2028-02-29']);
    expect(days('2028-02', d29)).toEqual(['2028-02-29']);
    expect(days('2026-04', d31)).toEqual(['2026-04-30']);
    expect(days('2026-01', d31)).toEqual(['2026-01-31']);
    // 2100 n'est pas bissextile.
    expect(days('2100-02', d29)).toEqual(['2100-02-28']);
  });

  it('marks an occurrence without a day as estimated, on the last day', () => {
    const unknown = rec('EXPENSE', 'COURANT', 'Eau', 4000, {
      dayOfMonth: null,
    });
    const [occurrence] = expandOccurrences([unknown], '2026-02');
    expect(occurrence.estimated).toBe(true);
    expect(occurrence.date.toISOString()).toBe('2026-02-28T00:00:00.000Z');
    const [known] = expandOccurrences(
      [rec('EXPENSE', 'COURANT', 'Eau', 4000)],
      '2026-02',
    );
    expect(known.estimated).toBe(false);
  });

  it('only keeps occurrences whose date lies within [startDate, endDate]', () => {
    const startsMidMonth = rec('EXPENSE', 'FIXE', 'Crèche', 5000, {
      dayOfMonth: 5,
      startDate: '2026-11-15',
    });
    expect(days('2026-10', startsMidMonth)).toEqual([]);
    expect(days('2026-11', startsMidMonth)).toEqual([]);
    expect(days('2026-12', startsMidMonth)).toEqual(['2026-12-05']);

    const startsOnTheDay = rec('EXPENSE', 'FIXE', 'Crèche', 5000, {
      startDate: '2026-11-05',
    });
    expect(days('2026-11', startsOnTheDay)).toEqual(['2026-11-05']);

    const endsBefore = rec('EXPENSE', 'FIXE', 'Crèche', 5000, {
      endDate: '2026-11-04',
    });
    expect(days('2026-11', endsBefore)).toEqual([]);
    const endsOnTheDay = rec('EXPENSE', 'FIXE', 'Crèche', 5000, {
      endDate: '2026-11-05',
    });
    expect(days('2026-11', endsOnTheDay)).toEqual(['2026-11-05']);
    expect(days('2026-12', endsOnTheDay)).toEqual([]);
  });

  it('ignores inactive items and sorts by date', () => {
    const late = rec('EXPENSE', 'FIXE', 'B tardif', 100, { dayOfMonth: 20 });
    const early = rec('EXPENSE', 'FIXE', 'A tôt', 100, { dayOfMonth: 2 });
    const off = rec('EXPENSE', 'FIXE', 'Off', 100, { active: false });
    expect(
      expandOccurrences([late, off, early], '2026-11').map((o) => o.label),
    ).toEqual(['A tôt', 'B tardif']);
  });
});

describe('labelsAreNeighbours', () => {
  it('ignores case and accents and accepts containment in both directions', () => {
    expect(labelsAreNeighbours('Électricité', 'PRLV ELECTRICITE EDF')).toBe(
      true,
    );
    expect(labelsAreNeighbours('PRLV LOYER NOV', 'loyer')).toBe(true);
    expect(labelsAreNeighbours('Loyer', 'Assurance')).toBe(false);
    expect(labelsAreNeighbours('  ', 'Loyer')).toBe(false);
  });
});

describe('matchOccurrences', () => {
  const today = new Date('2026-11-12T00:00:00Z');
  const run = (
    items: ReturnType<typeof rec>[],
    txs: ReturnType<typeof tx>[],
    now = today,
  ) => matchOccurrences(expandOccurrences(items, '2026-11'), txs, now);

  it('matches on kind, bloc and neighbour label', () => {
    const rent = rec('EXPENSE', 'FIXE', 'Loyer', 110000);
    const [paid] = run(
      [rent],
      [tx('EXPENSE', 'FIXE', 'PRLV LOYER NOVEMBRE', 109900, '2026-11-06')],
    );
    expect(paid.status).toBe('PAID');
    expect(paid.matchedAmountCents).toBe(109900);

    const [wrongBloc] = run(
      [rent],
      [tx('EXPENSE', 'COURANT', 'PRLV LOYER', 110000, '2026-11-05')],
    );
    expect(wrongBloc.status).toBe('MISSING');
    const [wrongKind] = run(
      [rent],
      [tx('INCOME', null, 'Loyer reçu', 110000, '2026-11-05')],
    );
    expect(wrongKind.status).toBe('MISSING');
  });

  it('lets each transaction cover a single occurrence', () => {
    const a = rec('EXPENSE', 'PLAISIR', 'Netflix', 1399, { dayOfMonth: 3 });
    const b = rec('EXPENSE', 'PLAISIR', 'Netflix', 1399, { dayOfMonth: 8 });
    const oneTx = [tx('EXPENSE', 'PLAISIR', 'NETFLIX.COM', 1399, '2026-11-03')];
    const one = run([a, b], oneTx);
    expect(one.map((o) => o.status)).toEqual(['PAID', 'MISSING']);

    const twoTx = [
      ...oneTx,
      tx('EXPENSE', 'PLAISIR', 'NETFLIX.COM', 1399, '2026-11-08'),
    ];
    expect(run([a, b], twoTx).map((o) => o.status)).toEqual(['PAID', 'PAID']);
  });

  it('prefers the closest day among identical labels', () => {
    const early = rec('EXPENSE', 'COURANT', 'Nounou', 50000, {
      dayOfMonth: 5,
    });
    const late = rec('EXPENSE', 'COURANT', 'Nounou', 50000, {
      dayOfMonth: 20,
    });
    const result = run(
      [early, late],
      [tx('EXPENSE', 'COURANT', 'Nounou', 50000, '2026-11-19')],
    );
    expect(result.map((o) => o.status)).toEqual(['MISSING', 'PAID']);
  });

  it('prefers an exact label over a mere neighbour', () => {
    const rent = rec('EXPENSE', 'FIXE', 'Loyer', 110000, { dayOfMonth: 5 });
    const garage = rec('EXPENSE', 'FIXE', 'Loyer garage', 5000, {
      dayOfMonth: 5,
    });
    // « Loyer garage » contient « loyer » : seule l'égalité stricte départage.
    const result = run(
      [rent, garage],
      [tx('EXPENSE', 'FIXE', 'LOYER', 110000, '2026-11-05')],
    );
    const byLabel = Object.fromEntries(result.map((o) => [o.label, o.status]));
    expect(byLabel).toEqual({ Loyer: 'PAID', 'Loyer garage': 'MISSING' });
  });

  it('matches an accented label with an unaccented statement line', () => {
    const power = rec('EXPENSE', 'FIXE', 'Électricité', 6000, {
      dayOfMonth: 10,
    });
    const [occurrence] = run(
      [power],
      [tx('EXPENSE', 'FIXE', 'PRLV ELECTRICITE EDF 11', 5900, '2026-11-10')],
    );
    expect(occurrence.status).toBe('PAID');
  });

  it('sets MISSING for a past date and DUE for today or later', () => {
    const yesterday = rec('EXPENSE', 'FIXE', 'Hier', 100, { dayOfMonth: 11 });
    const sameDay = rec('EXPENSE', 'FIXE', 'Aujourd hui', 100, {
      dayOfMonth: 12,
    });
    const tomorrow = rec('EXPENSE', 'FIXE', 'Demain', 100, { dayOfMonth: 13 });
    const result = run(
      [yesterday, sameDay, tomorrow],
      [],
      new Date('2026-11-12T23:59:59Z'),
    );
    expect(result.map((o) => o.status)).toEqual(['MISSING', 'DUE', 'DUE']);
  });

  it('matches income recurring items too', () => {
    const salary = rec('INCOME', null, 'Salaire', 380000, { dayOfMonth: 2 });
    const [occurrence] = run(
      [salary],
      [tx('INCOME', null, 'VIR SALAIRE ACME', 381000, '2026-11-02')],
    );
    expect(occurrence.status).toBe('PAID');
  });
});

describe('buildForecast', () => {
  const loyer = rec('EXPENSE', 'FIXE', 'Loyer', 110000, { dayOfMonth: 5 });
  const assurance = rec('EXPENSE', 'FIXE', 'Assurance', 4500, {
    dayOfMonth: 8,
  });
  const netflix = rec('EXPENSE', 'PLAISIR', 'Netflix', 1399, {
    dayOfMonth: 15,
  });
  const salaire = rec('INCOME', null, 'Salaire', 380000, { dayOfMonth: 28 });
  const items = [loyer, assurance, netflix, salaire];
  const transactions = [
    tx('EXPENSE', 'FIXE', 'PRLV LOYER NOVEMBRE', 110000, '2026-11-05'),
  ];

  it('projects the current month from actuals plus the occurrences not yet found', () => {
    const forecast = buildForecast({
      month: '2026-11',
      today: TODAY,
      plan: PLAN,
      transactions,
      recurring: items,
    });

    expect(forecast.asOf.toISOString()).toBe('2026-11-12T00:00:00.000Z');
    expect(forecast.occurrences.map((o) => [o.label, o.status])).toEqual([
      ['Loyer', 'PAID'],
      ['Assurance', 'MISSING'],
      ['Netflix', 'DUE'],
      ['Salaire', 'DUE'],
    ]);
    expect(forecast.income).toEqual({
      plannedCents: 380000,
      actualCents: 0,
      expectedRemainingCents: 380000,
      projectedCents: 380000,
    });
    expect(forecast.blocs.map((b) => b.bloc)).toEqual([
      'FIXE',
      'COURANT',
      'PLAISIR',
      'EPARGNE',
    ]);
    expect(forecast.blocs[0]).toEqual({
      bloc: 'FIXE',
      plannedCents: 175000,
      actualCents: 110000,
      expectedRemainingCents: 4500,
      projectedCents: 114500,
    });
    expect(forecast.blocs[2]).toMatchObject({
      bloc: 'PLAISIR',
      actualCents: 0,
      expectedRemainingCents: 1399,
      projectedCents: 1399,
    });
    // 380 000 - (114 500 + 0 + 1 399 + 0)
    expect(forecast.projectedBalanceCents).toBe(264101);
    // Chaque bloc compte au moins son prévu : 380 000 - (175 000 + 100 000 + 45 000 + 20 000)
    expect(forecast.cautiousBalanceCents).toBe(40000);
  });

  it('keeps a cautious balance at least as low as the projected balance', () => {
    const over = buildForecast({
      month: '2026-11',
      today: TODAY,
      plan: SpacePlan.create({
        incomeCents: 100000,
        fixeCents: 1000,
        courantCents: 0,
        plaisirCents: 0,
        epargneCents: 0,
      }),
      transactions: [tx('EXPENSE', 'FIXE', 'Gros achat', 50000, '2026-11-02')],
      recurring: [],
    });
    // Le projeté dépasse le prévu : le prudent le suit.
    expect(over.projectedBalanceCents).toBe(-50000);
    expect(over.cautiousBalanceCents).toBe(-50000);
  });

  it('makes the projection equal to the actuals for a fully past month', () => {
    const forecast = buildForecast({
      month: '2026-10',
      today: TODAY,
      plan: PLAN,
      transactions: [
        tx('EXPENSE', 'FIXE', 'PRLV LOYER', 110000, '2026-10-05'),
        tx('INCOME', null, 'VIR SALAIRE', 380000, '2026-10-28'),
      ],
      recurring: items,
    });
    // Assurance et Netflix n'ont pas été retrouvées : MISSING, mais pas ajoutées.
    expect(forecast.occurrences.map((o) => o.status)).toEqual([
      'PAID',
      'MISSING',
      'MISSING',
      'PAID',
    ]);
    for (const line of [forecast.income, ...forecast.blocs]) {
      expect(line.expectedRemainingCents).toBe(0);
      expect(line.projectedCents).toBe(line.actualCents);
    }
    expect(forecast.projectedBalanceCents).toBe(270000);
    expect(forecast.cautiousBalanceCents).toBe(forecast.projectedBalanceCents);
  });

  it('marks everything DUE for a future month and applies the plan to the cautious balance', () => {
    const forecast = buildForecast({
      month: '2027-01',
      today: TODAY,
      plan: PLAN,
      transactions: [],
      recurring: items,
    });
    expect(new Set(forecast.occurrences.map((o) => o.status))).toEqual(
      new Set(['DUE']),
    );
    expect(forecast.income.projectedCents).toBe(380000);
    // Loyer 110 000 + Assurance 4 500 : rien n'est encore retrouvé.
    expect(forecast.blocs[0].projectedCents).toBe(114500);
    expect(forecast.projectedBalanceCents).toBe(264101);
    expect(forecast.cautiousBalanceCents).toBe(40000);
  });

  it('returns four empty blocs for a space with no plan, data or recurring items', () => {
    const forecast = buildForecast({
      month: '2026-11',
      today: TODAY,
      plan: SpacePlan.empty(),
      transactions: [],
      recurring: [],
    });
    expect(forecast.blocs).toHaveLength(4);
    expect(forecast.occurrences).toEqual([]);
    expect(forecast.projectedBalanceCents).toBe(0);
    expect(forecast.cautiousBalanceCents).toBe(0);
  });

  it('counts an unmatched expense once, as expected remaining', () => {
    const forecast = buildForecast({
      month: '2026-11',
      today: TODAY,
      plan: SpacePlan.empty(),
      transactions: [tx('EXPENSE', 'COURANT', 'Courses', 5000, '2026-11-03')],
      recurring: [rec('EXPENSE', 'FIXE', 'Cantine', 8000, { dayOfMonth: 6 })],
    });
    expect(forecast.occurrences[0].status).toBe('MISSING');
    expect(forecast.blocs[0]).toMatchObject({
      actualCents: 0,
      expectedRemainingCents: 8000,
      projectedCents: 8000,
    });
    expect(forecast.projectedBalanceCents).toBe(-13000);
  });

  it('does not double count a recurring item found in the statement', () => {
    const forecast = buildForecast({
      month: '2026-11',
      today: TODAY,
      plan: SpacePlan.empty(),
      transactions: [tx('EXPENSE', 'FIXE', 'CANTINE NOV', 8200, '2026-11-06')],
      recurring: [rec('EXPENSE', 'FIXE', 'Cantine', 8000, { dayOfMonth: 6 })],
    });
    expect(forecast.blocs[0].expectedRemainingCents).toBe(0);
    expect(forecast.blocs[0].projectedCents).toBe(8200);
  });
});
