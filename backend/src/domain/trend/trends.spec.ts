import { tx } from '../../testing/builders';
import { DomainError } from '../shared/domain-error';
import {
  assertValidWindow,
  buildTrends,
  findSpendingRiser,
  labelGroupKey,
  shiftMonth,
  windowMonths,
} from './trends';

/** Dépense COURANT du jour 10 du mois donné (`2026-10`). */
const spend = (
  label: string,
  cents: number,
  month: string,
  bloc: 'FIXE' | 'COURANT' | 'PLAISIR' | 'EPARGNE' = 'COURANT',
) => tx('EXPENSE', bloc, label, cents, `${month}-10`);
const earn = (cents: number, month: string) =>
  tx('INCOME', null, 'Salaire', cents, `${month}-28`);

/** Fenêtre de 6 mois : 2026-05 à 2026-10 ; ancienne moitié = mai-juil., récente = août-oct. */
const M = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
const perMonth = (
  label: string,
  amounts: number[],
  bloc: 'FIXE' | 'COURANT' | 'PLAISIR' | 'EPARGNE' = 'COURANT',
) =>
  amounts.flatMap((cents, i) =>
    cents > 0 ? [spend(label, cents, M[i], bloc)] : [],
  );
const trends6 = (...lists: ReturnType<typeof tx>[][]) =>
  buildTrends('2026-10', 6, lists.flat());

describe('month helpers', () => {
  it('shifts months across year boundaries', () => {
    expect(shiftMonth('2026-10', 0)).toBe('2026-10');
    expect(shiftMonth('2026-10', -5)).toBe('2026-05');
    expect(shiftMonth('2026-02', -5)).toBe('2025-09');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -24)).toBe('2024-01');
    expect(windowMonths('2026-02', 4)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('validates the window: 3 to 24 months, starting in 2000 at the earliest', () => {
    for (const bad of [0, 1, 2, 25, 100, 3.5, NaN]) {
      expect(() => assertValidWindow('2026-10', bad)).toThrow(DomainError);
    }
    expect(() => assertValidWindow('2026-10', 3)).not.toThrow();
    expect(() => assertValidWindow('2026-10', 24)).not.toThrow();
    expect(() => assertValidWindow('2000-03', 3)).not.toThrow(); // commence en 2000-01
    expect(() => assertValidWindow('2000-02', 3)).toThrow(/avant 2000/); // commence en 1999-12
    expect(() => assertValidWindow('1999-12', 3)).toThrow(DomainError);
    expect(() => assertValidWindow('2001-12', 24)).not.toThrow(); // commence en 2000-01
    expect(() => assertValidWindow('2001-11', 24)).toThrow(DomainError); // 1999-12
  });
});

describe('labelGroupKey', () => {
  it('ignores case, accents, spaces and compresses digit runs', () => {
    expect(labelGroupKey('CARTE 1234')).toBe(labelGroupKey('carte   5678'));
    expect(labelGroupKey('CB CARREFOUR 04/10')).toBe(
      labelGroupKey('cb carrefour 17/11'),
    );
    expect(labelGroupKey('Café Étoilé')).toBe(labelGroupKey('CAFE ETOILE'));
    expect(labelGroupKey('Prélèvement  EDF 2026')).toBe('prelevement edf #');
    expect(labelGroupKey('Carte')).not.toBe(labelGroupKey('Carte 12'));
    expect(labelGroupKey('Abonnement 4G')).toBe('abonnement #g');
  });
});

describe('buildTrends: months', () => {
  it('lists every month of the window, empty ones at zero', () => {
    const result = buildTrends('2026-10', 6, []);
    expect(result.from).toBe('2026-05');
    expect(result.to).toBe('2026-10');
    expect(result.months.map((m) => m.month)).toEqual(M);
    for (const month of result.months) {
      expect(month).toMatchObject({
        incomeCents: 0,
        expenseCents: 0,
        balanceCents: 0,
        savingsRatePercent: 0,
        blocs: { FIXE: 0, COURANT: 0, PLAISIR: 0, EPARGNE: 0 },
      });
    }
    expect(result.averages).toEqual({
      incomeCents: 0,
      expenseCents: 0,
      savingsRatePercent: 0,
    });
    expect(result.topLabels).toEqual([]);
    expect(result.risers).toEqual([]);
  });

  it('totals income, expenses per bloc and the balance of each month', () => {
    const result = trends6(
      [
        earn(380000, '2026-10'),
        spend('Loyer', 171000, '2026-10', 'FIXE'),
        spend('Courses', 142000, '2026-10'),
        spend('Resto', 38000, '2026-10', 'PLAISIR'),
        spend('Courses', 1000, '2026-09'),
      ].flat(),
    );
    expect(result.months[5]).toEqual({
      month: '2026-10',
      incomeCents: 380000,
      expenseCents: 351000,
      balanceCents: 29000,
      savingsRatePercent: 8, // 7,63 arrondi
      blocs: { FIXE: 171000, COURANT: 142000, PLAISIR: 38000, EPARGNE: 0 },
    });
    expect(result.months[4]).toMatchObject({
      incomeCents: 0,
      expenseCents: 1000,
      balanceCents: -1000,
      savingsRatePercent: 0,
    });
  });

  it('rounds the monthly savings rate half away from zero, with negative rates and no -0', () => {
    const rate = (income: number, expense: number) =>
      buildTrends('2026-10', 3, [
        earn(income, '2026-10'),
        spend('x', expense, '2026-10'),
      ]).months[2].savingsRatePercent;
    expect(rate(200000, 199000)).toBe(1); // 0,5
    expect(rate(200000, 199001)).toBe(0);
    expect(rate(200000, 201000)).toBe(-1); // -0,5
    expect(rate(300000, 350000)).toBe(-17); // -16,67
    expect(rate(300000, 301000)).toBe(0);
    expect(Object.is(rate(300000, 301000), 0)).toBe(true);
    expect(rate(380000, 351000)).toBe(8);
  });

  it('keeps EPARGNE expenses in blocs and expenseCents', () => {
    const result = trends6(
      perMonth(
        'Virement livret',
        [30000, 30000, 30000, 30000, 30000, 30000],
        'EPARGNE',
      ),
      perMonth('Courses', [10000, 0, 0, 0, 0, 0]),
    );
    expect(result.months[0]).toMatchObject({
      expenseCents: 40000,
      blocs: { COURANT: 10000, EPARGNE: 30000 },
    });
    expect(result.months[5]).toMatchObject({
      expenseCents: 30000,
      balanceCents: -30000,
      blocs: { EPARGNE: 30000 },
    });
    expect(result.averages.expenseCents).toBe(Math.floor(190000 / 6));
  });

  it('ignores operations outside the window and counts months on UTC dates', () => {
    const result = buildTrends('2026-10', 3, [
      tx('EXPENSE', 'COURANT', 'Hors fenêtre', 1111, '2026-07-31T23:59:59Z'),
      tx('EXPENSE', 'COURANT', 'Dans août', 100, '2026-08-01T00:00:00Z'),
      tx('EXPENSE', 'COURANT', 'Dans octobre', 200, '2026-10-31T23:59:59Z'),
      tx('EXPENSE', 'COURANT', 'Après', 3333, '2026-11-01T00:00:00Z'),
    ]);
    expect(result.months.map((m) => m.expenseCents)).toEqual([100, 0, 200]);
    expect(result.topLabels.map((l) => l.label)).toEqual([
      'Dans octobre',
      'Dans août',
    ]);
  });
});

describe('buildTrends: averages', () => {
  it('averages over the whole window (empty months included), rounded down', () => {
    const result = buildTrends('2026-10', 6, [
      earn(100000, '2026-10'),
      spend('x', 40000, '2026-10'),
      spend('y', 1, '2026-09'),
    ]);
    expect(result.averages.incomeCents).toBe(16666); // 100 000 / 6 = 16 666,67
    expect(result.averages.expenseCents).toBe(6666); // 40 001 / 6 = 6 666,83
    // Taux pondéré : (100 000 − 40 001) / 100 000 = 59,999 -> 60.
    expect(result.averages.savingsRatePercent).toBe(60);
  });

  it('gives a zero savings rate without income', () => {
    expect(
      buildTrends('2026-10', 6, [spend('x', 5000, '2026-10')]).averages,
    ).toEqual({
      incomeCents: 0,
      expenseCents: 833,
      savingsRatePercent: 0,
    });
  });
});

describe('buildTrends: top labels', () => {
  it('groups labels without case, accents or digits and keeps the most frequent label', () => {
    const result = trends6([
      tx('EXPENSE', 'COURANT', 'CARTE 1234 CARREFOUR', 5000, '2026-10-02'),
      tx('EXPENSE', 'COURANT', 'CARTE 5678 CARREFOUR', 3000, '2026-10-05'),
      tx('EXPENSE', 'COURANT', 'CARTE 5678 CARREFOUR', 2000, '2026-09-05'),
      tx('EXPENSE', 'COURANT', 'carte 9999 carrefour', 1000, '2026-09-06'),
    ]);
    expect(result.topLabels).toEqual([
      // « CARTE 5678 CARREFOUR » : 2 occurrences, contre 1 pour chacun des autres.
      {
        label: 'CARTE 5678 CARREFOUR',
        totalCents: 11000,
        monthlyAverageCents: 1833,
        trendPercent: null,
      },
    ]);
  });

  it('breaks a frequency tie with the most recent label', () => {
    const result = trends6([
      tx('EXPENSE', 'COURANT', 'Café Étoilé', 1000, '2026-06-01'),
      tx('EXPENSE', 'COURANT', 'CAFE ETOILE', 1000, '2026-08-01'),
    ]);
    expect(result.topLabels[0].label).toBe('CAFE ETOILE');
    const reverse = trends6([
      tx('EXPENSE', 'COURANT', 'Café Étoilé', 1000, '2026-09-01'),
      tx('EXPENSE', 'COURANT', 'CAFE ETOILE', 1000, '2026-08-01'),
    ]);
    expect(reverse.topLabels[0].label).toBe('Café Étoilé');
  });

  it('computes totals and floor monthly averages (820 000 over 6 months = 136 666)', () => {
    const result = trends6(
      perMonth('Courses', [130000, 140000, 150000, 135000, 130000, 135000]),
    );
    expect(result.topLabels).toEqual([
      expect.objectContaining({
        label: 'Courses',
        totalCents: 820000,
        monthlyAverageCents: 136666,
      }),
    ]);
  });

  it('sorts by total (then label), keeps 8 at most, and excludes incomes and EPARGNE', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      spend(`Poste ${String.fromCharCode(65 + i)}`, (i + 1) * 1000, '2026-10'),
    );
    const result = trends6(
      many,
      perMonth(
        'Virement livret',
        [99999, 99999, 99999, 99999, 99999, 99999],
        'EPARGNE',
      ),
      [earn(999999, '2026-10')],
    );
    expect(result.topLabels).toHaveLength(8);
    expect(result.topLabels.map((l) => l.label)).toEqual([
      'Poste J',
      'Poste I',
      'Poste H',
      'Poste G',
      'Poste F',
      'Poste E',
      'Poste D',
      'Poste C',
    ]);
    const text = JSON.stringify(result.topLabels);
    expect(text).not.toContain('livret');
    expect(text).not.toContain('Salaire');
    expect(
      trends6([
        spend('B', 1000, '2026-10'),
        spend('A', 1000, '2026-10'),
      ]).topLabels.map((l) => l.label),
    ).toEqual(['A', 'B']);
  });
});

describe('buildTrends: trendPercent (recent half vs older half)', () => {
  const trend = (amounts: number[]) =>
    trends6(perMonth('X', amounts)).topLabels[0].trendPercent;

  it('compares the last 3 months with the first 3 of a 6-month window', () => {
    expect(trend([10000, 10000, 10000, 20000, 20000, 20000])).toBe(100);
    expect(trend([20000, 20000, 20000, 10000, 10000, 10000])).toBe(-50);
    expect(trend([10000, 10000, 10000, 10000, 10000, 10000])).toBe(0);
    expect(trend([10000, 0, 0, 0, 0, 30000])).toBe(200);
  });

  it('is null when the older half has no such expense, and -100 when the recent half is empty', () => {
    expect(trend([0, 0, 0, 5000, 5000, 5000])).toBeNull();
    expect(trend([5000, 5000, 5000, 0, 0, 0])).toBe(-100);
  });

  it('rounds to the nearest integer, halves away from zero', () => {
    expect(trend([3, 0, 0, 4, 0, 0])).toBe(33); // +33,33
    expect(trend([8, 0, 0, 9, 0, 0])).toBe(13); // +12,5
    expect(trend([8, 0, 0, 7, 0, 0])).toBe(-13); // -12,5
    expect(trend([3, 0, 0, 2, 0, 0])).toBe(-33);
  });

  it('on an odd window ignores the middle month (3 months: first vs last; 5 months: 2 vs 2)', () => {
    const three = buildTrends('2026-10', 3, [
      spend('X', 1000, '2026-08'),
      spend('X', 999999, '2026-09'),
      spend('X', 2000, '2026-10'),
    ]);
    expect(three.topLabels[0]).toMatchObject({
      totalCents: 1002999,
      trendPercent: 100,
    });
    // 5 mois (juin-oct.) : anciennes = juin, juil. ; récentes = sept., oct. ; août est ignoré.
    const five = buildTrends('2026-10', 5, [
      spend('X', 1000, '2026-06'),
      spend('X', 1000, '2026-07'),
      spend('X', 888888, '2026-08'),
      spend('X', 1500, '2026-09'),
      spend('X', 1500, '2026-10'),
    ]);
    expect(five.topLabels[0].trendPercent).toBe(50);
    expect(five.topLabels[0].totalCents).toBe(893888); // le total couvre toute la fenêtre
    // Seul le mois du milieu a des opérations : la moitié ancienne est vide.
    expect(
      buildTrends('2026-10', 5, [spend('X', 5000, '2026-08')]).topLabels[0]
        .trendPercent,
    ).toBeNull();
  });
});

describe('buildTrends: risers', () => {
  const risers = (older: number, recent: number, label = 'X') =>
    trends6(perMonth(label, [older, older, older, recent, recent, recent]))
      .risers;

  it('requires at least 20 € AND 20 % more per month (integer thresholds)', () => {
    expect(risers(5000, 9000)).toEqual([
      {
        label: 'X',
        recentAverageCents: 9000,
        previousAverageCents: 5000,
        deltaCents: 4000,
      },
    ]);
    // 2 000 exactement et 20 % exactement : retenu.
    expect(risers(10000, 12000)).toHaveLength(1);
    // 1 999 : sous les 20 €.
    expect(risers(10000, 11999)).toHaveLength(0);
    // +20 € mais seulement +10 % : sous les 20 %.
    expect(risers(20000, 22000)).toHaveLength(0);
    // +20 € et +19,99 % : sous les 20 %.
    expect(risers(10000, 11999)).toHaveLength(0);
    expect(risers(20000, 24000)).toHaveLength(1); // 20 % pile
    expect(risers(20000, 23999)).toHaveLength(0);
    // Une baisse n'est jamais un riser.
    expect(risers(9000, 5000)).toHaveLength(0);
  });

  it('counts a brand new expense as a riser when it reaches 20 €', () => {
    expect(risers(0, 2000)).toEqual([
      {
        label: 'X',
        recentAverageCents: 2000,
        previousAverageCents: 0,
        deltaCents: 2000,
      },
    ]);
    expect(risers(0, 1999)).toHaveLength(0);
  });

  it('uses floor averages per half (monthly average of the half)', () => {
    const flo = trends6(
      perMonth('Z', [10000, 10000, 10001, 12000, 12000, 12001]),
    );
    // Anciennes 30 001 / 3 = 10 000 ; récentes 36 001 / 3 = 12 000.
    expect(flo.risers[0]).toMatchObject({
      previousAverageCents: 10000,
      recentAverageCents: 12000,
      deltaCents: 2000,
    });
  });

  it('sorts by delta (then label) and keeps five at most', () => {
    const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const all = labels.flatMap((l, i) =>
      perMonth(l, [
        0,
        0,
        0,
        10000 + i * 1000,
        10000 + i * 1000,
        10000 + i * 1000,
      ]),
    );
    const result = trends6(all);
    expect(result.risers.map((r) => r.label)).toEqual([
      'G',
      'F',
      'E',
      'D',
      'C',
    ]);
    expect(result.risers.map((r) => r.deltaCents)).toEqual([
      16000, 15000, 14000, 13000, 12000,
    ]);
    const ties = trends6([
      ...perMonth('B', [0, 0, 0, 5000, 5000, 5000]),
      ...perMonth('A', [0, 0, 0, 5000, 5000, 5000]),
    ]);
    expect(ties.risers.map((r) => r.label)).toEqual(['A', 'B']);
  });

  it('is empty under 4 months, works at exactly 4 (2 vs 2) and excludes EPARGNE', () => {
    const three = buildTrends('2026-10', 3, [
      spend('X', 1000, '2026-08'),
      spend('X', 90000, '2026-10'),
    ]);
    expect(three.risers).toEqual([]);
    const four = buildTrends('2026-10', 4, [
      spend('X', 1000, '2026-07'),
      spend('X', 1000, '2026-08'),
      spend('X', 9000, '2026-09'),
      spend('X', 9000, '2026-10'),
    ]);
    expect(four.risers).toEqual([
      {
        label: 'X',
        recentAverageCents: 9000,
        previousAverageCents: 1000,
        deltaCents: 8000,
      },
    ]);
    const savings = trends6(
      perMonth('Virement livret', [0, 0, 0, 50000, 50000, 50000], 'EPARGNE'),
    );
    expect(savings.risers).toEqual([]);
    expect(savings.topLabels).toEqual([]);
    expect(savings.months[5].blocs.EPARGNE).toBe(50000);
  });

  it('groups digits into the same riser', () => {
    const result = trends6([
      tx('EXPENSE', 'COURANT', 'CB RESTO 11', 5000, '2026-06-03'),
      tx('EXPENSE', 'COURANT', 'CB RESTO 22', 5000, '2026-07-03'),
      tx('EXPENSE', 'COURANT', 'CB RESTO 33', 30000, '2026-09-03'),
      tx('EXPENSE', 'COURANT', 'CB RESTO 44', 30000, '2026-10-03'),
    ]);
    expect(result.risers).toHaveLength(1);
    expect(result.risers[0]).toMatchObject({
      previousAverageCents: 3333,
      recentAverageCents: 20000,
      deltaCents: 16667,
    });
  });
});

describe('findSpendingRiser', () => {
  const series = (older: number, recent: number, firstMonthIndex = 0) =>
    M.flatMap((m, i) =>
      i < firstMonthIndex
        ? []
        : [spend('Restaurant', i < 3 ? older : recent, m)],
    );

  it('returns the first riser with at least 50 € more per month', () => {
    expect(findSpendingRiser('2026-10', series(5000, 10000))).toEqual({
      label: 'Restaurant',
      recentAverageCents: 10000,
      previousAverageCents: 5000,
      deltaCents: 5000,
    });
    expect(findSpendingRiser('2026-10', series(5000, 9999))).toBeNull(); // +49,99 €
  });

  it('shortens the window to the first month with data and needs 4 months of data', () => {
    // 6 mois de données.
    expect(findSpendingRiser('2026-10', series(1000, 9000))).not.toBeNull();
    // Données depuis août : 3 mois seulement.
    expect(
      findSpendingRiser('2026-10', [
        spend('X', 1000, '2026-08'),
        spend('X', 90000, '2026-09'),
        spend('X', 90000, '2026-10'),
      ]),
    ).toBeNull();
    // Données depuis juillet : 4 mois, fenêtre raccourcie (juil.-août contre sept.-oct.).
    const young = findSpendingRiser('2026-10', [
      spend('X', 1000, '2026-07'),
      spend('X', 1000, '2026-08'),
      spend('X', 9000, '2026-09'),
      spend('X', 9000, '2026-10'),
    ]);
    expect(young).toMatchObject({
      previousAverageCents: 1000,
      recentAverageCents: 9000,
    });
    // Sans cela (fenêtre de 6 mois), la moitié ancienne vide ferait tout « monter » : ici 0 -> 9 000 serait faux.
    expect(findSpendingRiser('2026-10', [])).toBeNull();
  });

  it('ignores EPARGNE and operations outside the 6-month window', () => {
    expect(
      findSpendingRiser(
        '2026-10',
        M.map((m) => spend('Virement', 90000, m, 'EPARGNE')),
      ),
    ).toBeNull();
    expect(
      findSpendingRiser('2026-10', [spend('X', 90000, '2026-03')]),
    ).toBeNull();
  });
});
