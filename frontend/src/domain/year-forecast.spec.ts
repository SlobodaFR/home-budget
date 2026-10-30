import { describe, expect, it } from 'vitest';
import {
  averageExpenseCents,
  barHeightPercent,
  describeHistogram,
  describePeakSentence,
  mainExpenseItems,
  maxExpenseCents,
  monthTitle,
  parseYearForecast,
  peakMonths,
  yearBalanceCents,
  YearForecastMonth,
} from './year-forecast';

const month = (key: string, overrides: Partial<YearForecastMonth> = {}): YearForecastMonth => ({
  month: key,
  incomeCents: 380000,
  expenseCents: 290000,
  balanceCents: 90000,
  cumulativeCents: 90000,
  peak: false,
  items: [],
  ...overrides,
});

describe('parseYearForecast', () => {
  it('reads the contract', () => {
    const forecast = parseYearForecast(
      {
        year: 2026,
        months: [
          {
            month: '2026-10',
            incomeCents: 380000,
            expenseCents: 700000,
            balanceCents: -320000,
            cumulativeCents: 10000,
            peak: true,
            items: [{ recurringId: 'r1', label: 'Taxe foncière', kind: 'EXPENSE', amountCents: 120000 }],
          },
          { month: '2026-01', incomeCents: 380000, expenseCents: 291000, balanceCents: 89000, cumulativeCents: 89000, peak: false, items: [] },
        ],
        totalIncomeCents: 4560000,
        totalExpenseCents: 3492000,
        provisionHintCents: 10000,
      },
      2026,
    );
    expect(forecast.months.map((entry) => entry.month)).toEqual(['2026-01', '2026-10']);
    expect(forecast.months[1]).toMatchObject({ peak: true, balanceCents: -320000 });
    expect(forecast.months[1].items[0]).toMatchObject({ label: 'Taxe foncière', kind: 'EXPENSE' });
    expect(forecast).toMatchObject({ year: 2026, totalIncomeCents: 4560000, totalExpenseCents: 3492000, provisionHintCents: 10000 });
  });

  it('survives garbage and recomputes missing totals', () => {
    expect(parseYearForecast(null, 2027)).toEqual({ year: 2027, months: [], totalIncomeCents: 0, totalExpenseCents: 0, provisionHintCents: 0 });
    const forecast = parseYearForecast({ months: [null, { month: 'bad' }, { month: '2026-02', incomeCents: 100, expenseCents: 40, items: [{ label: 'x' }, { label: 'Ok', amountCents: 5 }] }] }, 2026);
    expect(forecast.months).toHaveLength(1);
    expect(forecast.months[0]).toMatchObject({ balanceCents: 60, cumulativeCents: 0, peak: false });
    expect(forecast.months[0].items).toHaveLength(1);
    expect(forecast).toMatchObject({ totalIncomeCents: 100, totalExpenseCents: 40, provisionHintCents: 0 });
  });
});

describe('year helpers', () => {
  const months = [month('2026-01'), month('2026-02', { expenseCents: 700000, balanceCents: -320000, peak: true }), month('2026-03', { expenseCents: 0 })];

  it('finds the peaks, the max and the average', () => {
    expect(peakMonths({ months }).map((entry) => entry.month)).toEqual(['2026-02']);
    expect(maxExpenseCents({ months })).toBe(700000);
    expect(averageExpenseCents({ months, totalExpenseCents: 990000 })).toBe(330000);
    expect(averageExpenseCents({ months: [], totalExpenseCents: 0 })).toBe(0);
  });

  it('computes the year balance', () => {
    expect(yearBalanceCents({ totalIncomeCents: 4560000, totalExpenseCents: 3492000 })).toBe(1068000);
    expect(yearBalanceCents({ totalIncomeCents: 100, totalExpenseCents: 300 })).toBe(-200);
  });

  it('scales bars, keeping a non zero bar visible', () => {
    expect(barHeightPercent(700000, 700000)).toBe(100);
    expect(barHeightPercent(350000, 700000)).toBe(50);
    expect(barHeightPercent(1, 700000)).toBe(4);
    expect(barHeightPercent(0, 700000)).toBe(0);
    expect(barHeightPercent(100, 0)).toBe(0);
  });

  it('names the month with a capital', () => {
    expect(monthTitle({ month: '2026-02' })).toBe('Février');
    expect(monthTitle({ month: '2026-12' })).toBe('Décembre');
  });

  it('keeps the biggest expenses of a month, not the incomes', () => {
    const items = [
      { recurringId: 'a', label: 'Salaire', kind: 'INCOME' as const, amountCents: 380000 },
      { recurringId: 'b', label: 'Loyer', kind: 'EXPENSE' as const, amountCents: 110000 },
      { recurringId: 'c', label: 'Taxe foncière', kind: 'EXPENSE' as const, amountCents: 120000 },
      { recurringId: 'd', label: 'Assurance', kind: 'EXPENSE' as const, amountCents: 50000 },
      { recurringId: 'e', label: 'Internet', kind: 'EXPENSE' as const, amountCents: 3000 },
    ];
    const { shown, hidden } = mainExpenseItems({ items });
    expect(shown.map((item) => item.label)).toEqual(['Taxe foncière', 'Loyer', 'Assurance']);
    expect(hidden).toBe(1);
  });

  it('gives the histogram a text alternative naming every month and the peaks', () => {
    const text = describeHistogram({ year: 2026, months });
    expect(text).toContain('Dépenses prévues par mois en 2026');
    expect(text).toMatch(/janvier 2\s?900,00\s€/);
    expect(text).toMatch(/février 7\s?000,00\s€/);
    expect(text).toContain('Mois pics : février.');
    expect(describeHistogram({ year: 2026, months: [month('2026-01')] })).toContain('Aucun mois pic.');
  });

  it('explains the peaks in a sentence', () => {
    expect(describePeakSentence([])).toMatch(/bien répartie/);
    expect(describePeakSentence([{ month: '2026-10' }])).toMatch(/octobre/);
    expect(describePeakSentence([{ month: '2026-10' }, { month: '2026-12' }])).toMatch(/2 mois sortent du lot : octobre et décembre/);
  });
});
