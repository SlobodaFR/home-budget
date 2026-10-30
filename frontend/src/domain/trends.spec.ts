import { describe, expect, it } from 'vitest';
import {
  barPercent,
  describeAverageSavings,
  describeBalanceChart,
  describeBalanceOfMonth,
  describeIncomeExpenseChart,
  describeNoRisers,
  describeRiser,
  describeSavingsSentence,
  describeTrend,
  hasAnyActivity,
  longMonthLabel,
  maxAbsBalance,
  maxIncomeExpense,
  parseTrends,
  shortMonthLabel,
  TREND_WINDOWS,
  trendDirection,
  TrendMonth,
} from './trends';

/** Les montants formatés contiennent des espaces insécables : on les ramène à des espaces simples. */
const plain = (value: string | null | undefined) => (value ?? '').replace(/[\s  ]/g, ' ');

const rawMonth = (month: string, income: number, expense: number, extra: Record<string, unknown> = {}) => ({
  month,
  incomeCents: income,
  expenseCents: expense,
  balanceCents: income - expense,
  savingsRatePercent: income > 0 ? Math.round(((income - expense) / income) * 100) : 0,
  blocs: { FIXE: 171000, COURANT: 142000, PLAISIR: 38000, EPARGNE: 0 },
  ...extra,
});

const raw = {
  from: '2026-09',
  to: '2026-10',
  months: [rawMonth('2026-09', 380000, 340000), rawMonth('2026-10', 380000, 351000)],
  averages: { incomeCents: 380000, expenseCents: 345500, savingsRatePercent: 9 },
  topLabels: [{ label: 'Courses', totalCents: 820000, monthlyAverageCents: 136666, trendPercent: 12 }],
  risers: [{ label: 'Restaurant', recentAverageCents: 9000, previousAverageCents: 5000, deltaCents: 4000 }],
};

const month = (overrides: Partial<TrendMonth> = {}): TrendMonth => ({
  month: '2026-10',
  incomeCents: 380000,
  expenseCents: 351000,
  balanceCents: 29000,
  savingsRatePercent: 8,
  blocs: { FIXE: 0, COURANT: 0, PLAISIR: 0, EPARGNE: 0 },
  ...overrides,
});

describe('parseTrends', () => {
  it('reads a complete answer', () => {
    const trends = parseTrends(raw);
    expect(trends.from).toBe('2026-09');
    expect(trends.to).toBe('2026-10');
    expect(trends.months).toHaveLength(2);
    expect(trends.months[1]).toMatchObject({ month: '2026-10', incomeCents: 380000, expenseCents: 351000, balanceCents: 29000, savingsRatePercent: 8 });
    expect(trends.months[1].blocs).toEqual({ FIXE: 171000, COURANT: 142000, PLAISIR: 38000, EPARGNE: 0 });
    expect(trends.averages).toEqual({ incomeCents: 380000, expenseCents: 345500, savingsRatePercent: 9 });
    expect(trends.topLabels).toEqual([{ label: 'Courses', totalCents: 820000, monthlyAverageCents: 136666, trendPercent: 12 }]);
    expect(trends.risers).toEqual([{ label: 'Restaurant', recentAverageCents: 9000, previousAverageCents: 5000, deltaCents: 4000 }]);
  });

  it('tolerates an empty or broken answer', () => {
    for (const value of [null, undefined, 'oops', [], {}, { months: 'x' }]) {
      expect(parseTrends(value)).toMatchObject({ months: [], topLabels: [], risers: [], from: '', to: '', averages: { incomeCents: 0, expenseCents: 0, savingsRatePercent: 0 } });
    }
  });

  it('puts the months in chronological order and skips unreadable ones', () => {
    const trends = parseTrends({ months: [rawMonth('2026-10', 1, 1), { month: 'nope' }, null, rawMonth('2026-08', 1, 1), rawMonth('2026-09', 1, 1)] });
    expect(trends.months.map((item) => item.month)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(trends.from).toBe('2026-08');
    expect(trends.to).toBe('2026-10');
  });

  it('recomputes the balance, rate and averages when the server forgot them', () => {
    const trends = parseTrends({ months: [{ month: '2026-09', incomeCents: 200000, expenseCents: 150000 }, { month: '2026-10', incomeCents: 200000, expenseCents: 170000 }] });
    expect(trends.months[0]).toMatchObject({ balanceCents: 50000, savingsRatePercent: 25, blocs: { FIXE: 0, COURANT: 0, PLAISIR: 0, EPARGNE: 0 } });
    expect(trends.averages).toEqual({ incomeCents: 200000, expenseCents: 160000, savingsRatePercent: 20 });
  });

  it('keeps a negative savings rate and a null trend', () => {
    const trends = parseTrends({ months: [rawMonth('2026-10', 100000, 120000)], topLabels: [{ label: 'x', totalCents: 100, monthlyAverageCents: 100, trendPercent: null }] });
    expect(trends.months[0].savingsRatePercent).toBe(-20);
    expect(trends.topLabels[0].trendPercent).toBeNull();
  });

  it('ignores unknown blocs and broken lines, sorts and caps the lists', () => {
    const labels = Array.from({ length: 10 }, (_, index) => ({ label: `L${index}`, totalCents: (index + 1) * 100 }));
    const risers = Array.from({ length: 7 }, (_, index) => ({ label: `R${index}`, recentAverageCents: 1000 + index * 100, previousAverageCents: 500 }));
    const trends = parseTrends({
      months: [rawMonth('2026-10', 1, 1, { blocs: { AUTRE: 5, FIXE: 9 } })],
      topLabels: [...labels, null, { totalCents: 5 }, { label: 'sans total' }],
      risers: [...risers, { label: 'x' }],
    });
    expect(trends.months[0].blocs.FIXE).toBe(9);
    expect(trends.topLabels).toHaveLength(8);
    expect(trends.topLabels[0].label).toBe('L9');
    expect(trends.topLabels[0].monthlyAverageCents).toBe(1000);
    expect(trends.risers).toHaveLength(5);
    expect(trends.risers[0]).toMatchObject({ label: 'R6', deltaCents: 1100 });
  });
});

describe('windows', () => {
  it('offers 3, 6 and 12 months', () => {
    expect([...TREND_WINDOWS]).toEqual([3, 6, 12]);
  });
});

describe('wording', () => {
  it('formats month labels', () => {
    expect(shortMonthLabel('2026-01')).toBe('janv.');
    expect(longMonthLabel('2026-10')).toBe('octobre 2026');
    expect(shortMonthLabel('nope')).toBe('nope');
  });

  it('describes the average savings rate', () => {
    expect(describeAverageSavings({ incomeCents: 380000, savingsRatePercent: 8 })).toBe('8 %');
    expect(describeAverageSavings({ incomeCents: 380000, savingsRatePercent: -12 })).toBe('-12 %');
    expect(describeAverageSavings({ incomeCents: 0, savingsRatePercent: 0 })).toBe('—');
  });

  it('explains the savings rate with a teaching sentence, for every case', () => {
    expect(describeSavingsSentence({ incomeCents: 380000, savingsRatePercent: 8 }, 6)).toBe(
      'En moyenne sur 6 mois, il vous reste 8 % de vos revenus après les dépenses. C’est ce qui peut aller en épargne : un taux régulier compte plus qu’un gros mois isolé.',
    );
    expect(describeSavingsSentence({ incomeCents: 380000, savingsRatePercent: -4 }, 3)).toContain('vous dépensez plus que vous ne gagnez (-4 %)');
    expect(describeSavingsSentence({ incomeCents: 380000, savingsRatePercent: 0 }, 3)).toContain('rien n’est mis de côté');
    expect(describeSavingsSentence({ incomeCents: 0, savingsRatePercent: 0 }, 3)).toContain('ne peut pas être calculé');
    expect(describeSavingsSentence({ incomeCents: 1, savingsRatePercent: 5 }, 1)).toContain('ce mois-ci');
  });

  it('writes the trend in words, never by arrow alone', () => {
    expect(trendDirection(12)).toBe('up');
    expect(trendDirection(-5)).toBe('down');
    expect(trendDirection(0)).toBe('flat');
    expect(trendDirection(null)).toBe('unknown');
    expect(describeTrend(12)).toBe('En hausse de 12 %');
    expect(describeTrend(-5)).toBe('En baisse de 5 %');
    expect(describeTrend(0)).toBe('Stable');
    expect(describeTrend(null)).toBe('Pas de comparaison possible');
  });

  it('describes a riser as « passe de X à Y par mois »', () => {
    expect(plain(describeRiser({ previousAverageCents: 5000, recentAverageCents: 9000, deltaCents: 4000 }))).toBe('Passe de 50 € à 90 € par mois (+ 40 € par mois).');
  });

  it('reassures when nothing rises, and explains when the window is too short', () => {
    expect(describeNoRisers(6)).toContain('Rien ne grimpe');
    expect(describeNoRisers(6)).toContain('bonne nouvelle');
    expect(describeNoRisers(3)).toContain('au moins 4 mois');
  });

  it('spots a period without any activity', () => {
    expect(hasAnyActivity({ months: [month({ incomeCents: 0, expenseCents: 0 })] })).toBe(false);
    expect(hasAnyActivity({ months: [month({ incomeCents: 0, expenseCents: 5 })] })).toBe(true);
    expect(hasAnyActivity({ months: [] })).toBe(false);
  });
});

describe('charts', () => {
  it('scales bars between 0 and 100, keeping a non-zero one visible', () => {
    expect(barPercent(0, 1000)).toBe(0);
    expect(barPercent(-5, 1000)).toBe(0);
    expect(barPercent(500, 1000)).toBe(50);
    expect(barPercent(1000, 1000)).toBe(100);
    expect(barPercent(5000, 1000)).toBe(100);
    expect(barPercent(1, 100000)).toBe(2);
    expect(barPercent(10, 0)).toBe(0);
  });

  it('finds the scale maxima', () => {
    const months = [month({ incomeCents: 100, expenseCents: 300, balanceCents: -200 }), month({ incomeCents: 400, expenseCents: 50, balanceCents: 350 })];
    expect(maxIncomeExpense(months)).toBe(400);
    expect(maxAbsBalance(months)).toBe(350);
    expect(maxIncomeExpense([])).toBe(0);
  });

  it('gives a complete alternative text with every figure of every month', () => {
    const months = [month({ month: '2026-09', incomeCents: 380000, expenseCents: 340000, balanceCents: 40000 }), month({ month: '2026-10', incomeCents: 380000, expenseCents: 400000, balanceCents: -20000 })];
    const text = plain(describeIncomeExpenseChart(months));
    expect(text).toContain('septembre 2026 : revenus 3 800 €, dépenses 3 400 €');
    expect(text).toContain('octobre 2026 : revenus 3 800 €, dépenses 4 000 €');
    const balance = plain(describeBalanceChart(months));
    expect(balance).toContain('septembre 2026 : solde positif de 400 €');
    expect(balance).toContain('octobre 2026 : solde négatif de 200 €');
    expect(describeBalanceOfMonth(0)).toBe('solde à l’équilibre');
    expect(describeIncomeExpenseChart([])).toBe('Aucune donnée.');
  });
});
