import { rec } from '../../testing/builders';
import { SpacePlan } from '../space/space-plan';
import { buildYearForecast } from './year-forecast';

const TODAY = new Date('2026-10-30T10:00:00Z');
const run = (
  recurring: ReturnType<typeof rec>[],
  over: Partial<Parameters<typeof buildYearForecast>[0]> = {},
) =>
  buildYearForecast({
    year: 2026,
    recurring,
    plan: SpacePlan.empty(),
    commonSpace: false,
    today: TODAY,
    ...over,
  });

const loyer = rec('EXPENSE', 'FIXE', 'Loyer', 110000);
const salaire = rec('INCOME', null, 'Salaire', 380000, { dayOfMonth: 28 });
const taxe = rec('EXPENSE', 'FIXE', 'Taxe foncière', 120000, {
  frequency: 'YEARLY',
  monthOfYear: 10,
  dayOfMonth: 15,
});
const assurance = rec('EXPENSE', 'FIXE', 'Assurance', 30000, {
  frequency: 'QUARTERLY',
  monthOfYear: 1,
  dayOfMonth: 8,
});
const prime = rec('INCOME', null, 'Prime', 100000, {
  frequency: 'YEARLY',
  monthOfYear: 12,
  dayOfMonth: 20,
});

describe('buildYearForecast', () => {
  const result = run([loyer, salaire, taxe, assurance, prime]);

  it('lists the 12 months with income, expenses, balance and running total', () => {
    expect(result.year).toBe(2026);
    expect(result.months.map((m) => m.month)).toEqual(
      Array.from(
        { length: 12 },
        (_, i) => `2026-${String(i + 1).padStart(2, '0')}`,
      ),
    );
    // Janvier : loyer 110 000 + assurance 30 000.
    expect(result.months[0]).toMatchObject({
      incomeCents: 380000,
      expenseCents: 140000,
      balanceCents: 240000,
      cumulativeCents: 240000,
      peak: false,
    });
    expect(result.months[1]).toMatchObject({
      expenseCents: 110000,
      balanceCents: 270000,
      cumulativeCents: 510000,
    });
    // Octobre : loyer + assurance trimestrielle + taxe foncière.
    expect(result.months[9]).toMatchObject({
      expenseCents: 110000 + 30000 + 120000,
      balanceCents: 380000 - 260000,
    });
    // Décembre : la prime annuelle s'ajoute au salaire.
    expect(result.months[11].incomeCents).toBe(480000);
  });

  it('lists the occurrences of each month, sorted by date', () => {
    expect(
      result.months[9].items.map((i) => [i.label, i.kind, i.amountCents]),
    ).toEqual([
      ['Loyer', 'EXPENSE', 110000], // le 5
      ['Assurance', 'EXPENSE', 30000], // le 8
      ['Taxe foncière', 'EXPENSE', 120000], // le 15
      ['Salaire', 'INCOME', 380000], // le 28
    ]);
    expect(result.months[1].items.map((i) => i.label)).toEqual([
      'Loyer',
      'Salaire',
    ]);
    expect(result.months[9].items[0]).toEqual({
      recurringId: expect.any(String),
      label: 'Loyer',
      kind: 'EXPENSE',
      amountCents: 110000,
    });
  });

  it('totals the year and exposes the monthly provision hint', () => {
    // 12 × 110 000 + 4 × 30 000 + 120 000
    expect(result.totalExpenseCents).toBe(1560000);
    // 12 × 380 000 + 100 000
    expect(result.totalIncomeCents).toBe(4660000);
    expect(result.months[11].cumulativeCents).toBe(4660000 - 1560000);
    // Taxe : 120 000 / 12 + assurance : 30 000 / 3
    expect(result.provisionHintCents).toBe(10000 + 10000);
  });

  it('flags as peaks the months above 130 % of the average monthly spending', () => {
    // Moyenne 130 000 : seuil 169 000. Octobre (260 000) est un pic, janvier (140 000) non.
    expect(result.months.filter((m) => m.peak).map((m) => m.month)).toEqual([
      '2026-10',
    ]);
  });
});

describe('buildYearForecast: peak threshold', () => {
  const base = rec('EXPENSE', 'FIXE', 'Loyer', 100000);
  const extra = (cents: number) =>
    rec('EXPENSE', 'FIXE', 'Extra', cents, {
      frequency: 'YEARLY',
      monthOfYear: 3,
    });

  it('is strict and computed on integers: 33 644 does not make a peak, 33 645 does', () => {
    // Total 1 200 000 + e ; pic si (100 000 + e) × 12 > (1 200 000 + e) × 1,3 <=> e > 33 644,86.
    expect(run([base, extra(33644)]).months[2].peak).toBe(false);
    expect(run([base, extra(33645)]).months[2].peak).toBe(true);
  });

  it('has no peak when nothing is spent, and a lone yearly payment is a peak', () => {
    expect(run([]).months.some((m) => m.peak)).toBe(false);
    expect(run([salaire]).months.some((m) => m.peak)).toBe(false);
    const lone = run([extra(120000)]);
    expect(lone.months.filter((m) => m.peak).map((m) => m.month)).toEqual([
      '2026-03',
    ]);
  });
});

describe('buildYearForecast: common space', () => {
  const plan = SpacePlan.create({
    incomeCents: 0,
    fixeCents: 175000,
    courantCents: 100000,
    plaisirCents: 45000,
    epargneCents: 20000,
  });

  it('completes the missing recurring income up to the sum of the blocs, every month', () => {
    const empty = run([loyer], { plan, commonSpace: true });
    expect(empty.months.every((m) => m.incomeCents === 340000)).toBe(true);
    expect(empty.totalIncomeCents).toBe(12 * 340000);
    expect(
      run([loyer, rec('INCOME', null, 'Virement', 300000)], {
        plan,
        commonSpace: true,
      }).months[0].incomeCents,
    ).toBe(340000);
    expect(
      run([loyer, rec('INCOME', null, 'Virement', 400000)], {
        plan,
        commonSpace: true,
      }).months[0].incomeCents,
    ).toBe(400000);
    // Un mois sans revenu récurrent (prime annuelle seule) est aussi complété.
    expect(
      run([prime], { plan, commonSpace: true }).months[0].incomeCents,
    ).toBe(340000);
  });

  it('leaves a personal space, or a common plan with its own income, untouched', () => {
    expect(
      run([loyer], { plan, commonSpace: false }).months[0].incomeCents,
    ).toBe(0);
    const withIncome = SpacePlan.create({
      ...plan.toProps(),
      incomeCents: 380000,
    });
    expect(
      run([loyer], { plan: withIncome, commonSpace: true }).months[0]
        .incomeCents,
    ).toBe(0);
  });
});

describe('buildYearForecast: edge cases', () => {
  it('handles a leap year and series cut by endDate', () => {
    const feb29 = rec('EXPENSE', 'FIXE', 'Cotisation', 5000, {
      frequency: 'YEARLY',
      monthOfYear: 2,
      dayOfMonth: 29,
    });
    expect(run([feb29], { year: 2028 }).months[1].items).toHaveLength(1);
    const cut = rec('EXPENSE', 'FIXE', 'Trimestre', 30000, {
      frequency: 'QUARTERLY',
      monthOfYear: 11,
      endDate: '2026-12-31',
    });
    // Février, mai et août 2026 existent (startDate 2026-01-01), novembre aussi ; rien après la fin.
    expect(
      run([cut])
        .months.filter((m) => m.items.length > 0)
        .map((m) => m.month),
    ).toEqual(['2026-02', '2026-05', '2026-08', '2026-11']);
    expect(
      run([cut], { year: 2027 }).months.every((m) => m.items.length === 0),
    ).toBe(true);
  });
});
