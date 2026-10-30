import { DomainError } from '../shared/domain-error';
import {
  amortize,
  monthlyInterestCents,
  nextPaymentDate,
  payoffDate,
} from './amortization';
import { Debt, DebtProps, ratePercentToHundredths } from './debt';
import {
  buildDebtView,
  buildDebtViews,
  summarizeDebts,
  whatIf,
} from './debt-view';

const day = (iso: string) => new Date(`${iso}T09:30:00Z`);

const base: DebtProps = {
  id: 'd1',
  spaceId: 'common',
  name: 'Prêt auto',
  kind: 'CAR',
  principalCents: 1500000,
  remainingCents: 1120000,
  annualRateHundredths: 390,
  monthlyPaymentCents: 32000,
  startDate: '2024-09-01',
  paymentDay: 5,
  insuranceMonthlyCents: 1500,
  archived: false,
  recurringId: null,
};
const debt = (over: Partial<DebtProps> = {}) =>
  Debt.create({ ...base, ...over });

describe('ratePercentToHundredths', () => {
  it('converts a percentage with at most two decimals, without float drift', () => {
    expect(ratePercentToHundredths(3.9)).toBe(390);
    expect(ratePercentToHundredths(3.5)).toBe(350);
    expect(ratePercentToHundredths(0)).toBe(0);
    expect(ratePercentToHundredths(0.07)).toBe(7); // 0,07 × 100 = 7,000000000000001
    expect(ratePercentToHundredths(0.29)).toBe(29); // 28,999999999999996
    expect(ratePercentToHundredths(1.1)).toBe(110);
    expect(ratePercentToHundredths(100)).toBe(10000);
    expect(ratePercentToHundredths(12.34)).toBe(1234);
  });

  it('rejects a third decimal, out-of-range and non-finite values', () => {
    for (const bad of [
      3.905,
      1.005,
      2.675,
      0.001,
      3.999,
      -0.01,
      -1,
      100.01,
      101,
      NaN,
      Infinity,
    ]) {
      expect(() => ratePercentToHundredths(bad)).toThrow(DomainError);
    }
    expect(() => ratePercentToHundredths('3.5' as never)).toThrow(DomainError);
  });
});

describe('Debt', () => {
  it('trims the name and exposes the integer rate', () => {
    const d = debt({ name: '  Prêt auto ' });
    expect(d.name).toBe('Prêt auto');
    expect(d.annualRateHundredths).toBe(390);
  });

  it.each([
    ['empty name', { name: ' ' }],
    ['name of 61 characters', { name: 'x'.repeat(61) }],
    ['unknown kind', { kind: 'YACHT' as never }],
    ['zero principal', { principalCents: 0 }],
    ['negative remaining', { remainingCents: -1 }],
    ['remaining above principal', { remainingCents: 1500001 }],
    ['fractional remaining', { remainingCents: 10.5 }],
    ['negative rate', { annualRateHundredths: -1 }],
    ['fractional rate', { annualRateHundredths: 3.5 }],
    ['rate above 100 %', { annualRateHundredths: 10001 }],
    ['negative payment', { monthlyPaymentCents: -1 }],
    ['negative insurance', { insuranceMonthlyCents: -1 }],
    ['impossible start date', { startDate: '2026-02-30' }],
    ['payment day 0', { paymentDay: 0 }],
    ['payment day 29', { paymentDay: 29 }],
    ['fractional payment day', { paymentDay: 5.5 }],
  ])('rejects %s', (_label, over) => {
    expect(() => debt(over)).toThrow(DomainError);
  });

  it('accepts the boundaries', () => {
    expect(() => debt({ name: 'x'.repeat(60) })).not.toThrow();
    expect(() => debt({ remainingCents: 0 })).not.toThrow();
    expect(() => debt({ remainingCents: 1500000 })).not.toThrow();
    expect(() => debt({ annualRateHundredths: 0 })).not.toThrow();
    expect(() => debt({ annualRateHundredths: 10000 })).not.toThrow();
    expect(() =>
      debt({ monthlyPaymentCents: 0, insuranceMonthlyCents: 0 }),
    ).not.toThrow();
    expect(() => debt({ paymentDay: 1 })).not.toThrow();
    expect(() => debt({ paymentDay: 28 })).not.toThrow();
  });
});

describe('monthlyInterestCents (integers, half up)', () => {
  it('computes capital × rate / (12 × 10 000) rounded to the nearest cent', () => {
    expect(monthlyInterestCents(10000000, 350)).toBe(29167); // 29 166,67
    expect(monthlyInterestCents(10000000, 360)).toBe(30000); // exact
    expect(monthlyInterestCents(1120000, 390)).toBe(3640); // 3 640 exact
    expect(monthlyInterestCents(10000000, 0)).toBe(0);
    expect(monthlyInterestCents(0, 350)).toBe(0);
  });

  it('rounds exact halves up and everything below down', () => {
    expect(monthlyInterestCents(12, 5000)).toBe(1); // 0,5 -> 1
    expect(monthlyInterestCents(11, 5000)).toBe(0); // 0,458
    expect(monthlyInterestCents(13, 5000)).toBe(1); // 0,54
    expect(monthlyInterestCents(36, 5000)).toBe(2); // 1,5 -> 2
    expect(monthlyInterestCents(35, 5000)).toBe(1); // 1,458
  });
});

describe('amortize (hand-checked figures)', () => {
  it('amortizes 100 000 € at 3,5 % with a 580 € payment in 240 months', () => {
    // Intérêts mensuels arrondis au centime ; dernière mensualité ajustée à 566,06 €.
    expect(amortize(10000000, 350, 58000)).toEqual({
      paidOff: true,
      months: 240,
      totalInterestCents: 3918606,
      lastPaymentCents: 56606,
    });
    // 579,96 € : la mensualité théorique sur 20 ans ; la dernière est ajustée à 579,85 €.
    expect(amortize(10000000, 350, 57996)).toMatchObject({
      months: 240,
      totalInterestCents: 3919029,
      lastPaymentCents: 57985,
    });
  });

  it('matches the contract example: 11 200 € at 3,9 % with 320 € in 38 months', () => {
    expect(amortize(1120000, 390, 32000)).toEqual({
      paidOff: true,
      months: 38,
      totalInterestCents: 70926,
      lastPaymentCents: 6926,
    });
  });

  it('handles a 0 % rate: no interest, last payment adjusted', () => {
    expect(amortize(1200000, 0, 50000)).toMatchObject({
      months: 24,
      totalInterestCents: 0,
      lastPaymentCents: 50000,
    });
    // 1 000 € à 300 € par mois : 3 mensualités pleines + 100 €.
    expect(amortize(100000, 0, 30000)).toMatchObject({
      months: 4,
      totalInterestCents: 0,
      lastPaymentCents: 10000,
    });
  });

  it('adjusts the last payment, interest included', () => {
    // 100 € à 6 % : 50 + 25 + 0 (0,375 arrondi à 0) d'intérêts.
    expect(amortize(10000, 600, 5000)).toMatchObject({
      months: 3,
      totalInterestCents: 75,
      lastPaymentCents: 75,
    });
    expect(amortize(5000, 1200, 2000)).toMatchObject({
      months: 3,
      totalInterestCents: 92,
      lastPaymentCents: 1092,
    });
    // Un seul versement suffit : mensualité plafonnée au solde + intérêts.
    expect(amortize(5000, 1200, 99999)).toMatchObject({
      months: 1,
      totalInterestCents: 50,
      lastPaymentCents: 5050,
    });
  });

  it('works at a 100 % rate', () => {
    expect(amortize(100000, 10000, 20000)).toMatchObject({
      months: 7,
      totalInterestCents: 34833,
      lastPaymentCents: 14833,
    });
  });

  it('is never paid off when the payment is below, or equal to, the first month interest', () => {
    const never = {
      paidOff: false,
      months: null,
      totalInterestCents: null,
      lastPaymentCents: null,
    };
    // 100 000 € à 3,6 % : 300 € d'intérêts le premier mois.
    expect(amortize(10000000, 360, 29900)).toEqual(never);
    expect(amortize(10000000, 360, 30000)).toEqual(never); // égal : la dette ne diminue pas
    expect(amortize(10000000, 360, 0)).toEqual(never);
    expect(amortize(100, 0, 0)).toEqual(never); // 0 % et rien payé
  });

  it('is never paid off beyond 1 200 months, and paid off just below', () => {
    // 1 cent de plus que les intérêts : 1 cent de capital par mois, plafond atteint.
    expect(amortize(10000000, 360, 30001).paidOff).toBe(false);
    expect(amortize(10000000, 360, 30100).paidOff).toBe(false);
    // 310 € : 1 147 mois (95 ans), sous le plafond.
    expect(amortize(10000000, 360, 31000)).toEqual({
      paidOff: true,
      months: 1147,
      totalInterestCents: 25537910,
      lastPaymentCents: 11910,
    });
    expect(amortize(10000000, 360, 32000)).toMatchObject({
      months: 926,
      totalInterestCents: 19618689,
    });
  });

  it('returns nothing to pay for a debt already repaid', () => {
    expect(amortize(0, 350, 58000)).toEqual({
      paidOff: true,
      months: 0,
      totalInterestCents: 0,
      lastPaymentCents: null,
    });
  });
});

describe('payment dates', () => {
  it('starts at the next payment day, today included', () => {
    const next = (today: string, paymentDay: number) =>
      nextPaymentDate(day(today), paymentDay).toISOString().slice(0, 10);
    expect(next('2026-10-30', 5)).toBe('2026-11-05');
    expect(next('2026-11-05', 5)).toBe('2026-11-05'); // aujourd'hui
    expect(next('2026-11-04', 5)).toBe('2026-11-05');
    expect(next('2026-11-06', 5)).toBe('2026-12-05');
    expect(next('2026-12-20', 5)).toBe('2027-01-05'); // changement d'année
    expect(next('2027-02-10', 28)).toBe('2027-02-28');
    expect(next('2028-02-29', 28)).toBe('2028-03-28');
  });

  it('puts the payoff date on the last payment', () => {
    // Exemple du contrat : 38 mensualités depuis le 30 octobre 2026, prélèvement le 5.
    expect(payoffDate(day('2026-10-30'), 5, 38)).toBe('2029-12-05');
    expect(payoffDate(day('2026-10-30'), 5, 1)).toBe('2026-11-05');
    expect(payoffDate(day('2026-10-30'), 5, 2)).toBe('2026-12-05');
    expect(payoffDate(day('2026-10-30'), 5, 3)).toBe('2027-01-05');
    expect(payoffDate(day('2026-11-05'), 5, 12)).toBe('2027-10-05');
    // Le 30 octobre, la 1re échéance du 28 est le 28 novembre : la 4e est le 28 février.
    expect(payoffDate(day('2026-10-30'), 28, 4)).toBe('2027-02-28');
    expect(payoffDate(day('2026-10-30'), 28, 3)).toBe('2027-01-28');
    // Un 28 février reste un 28 (pas de débordement en mars).
    expect(payoffDate(day('2027-01-30'), 28, 1)).toBe('2027-02-28');
    expect(payoffDate(day('2027-01-30'), 28, 2)).toBe('2027-03-28');
    expect(payoffDate(day('2026-10-30'), 5, 0)).toBeNull();
  });
});

describe('buildDebtView', () => {
  it('reproduces the contract example (38 months, paid share 25 %)', () => {
    const view = buildDebtView(debt(), day('2026-10-30'));
    expect(view).toMatchObject({
      monthsRemaining: 38,
      payoffDate: '2029-12-05',
      totalInterestRemainingCents: 70926,
      paidSharePercent: 25, // 380 000 / 1 500 000 = 25,33
      neverPaidOff: false,
      nextMonthInterestCents: 3640,
    });
  });

  it('floors the paid share and reaches 100 only when nothing is left', () => {
    const share = (remaining: number) =>
      buildDebtView(debt({ remainingCents: remaining }), day('2026-10-30'))
        .paidSharePercent;
    expect(share(1500000)).toBe(0);
    expect(share(1)).toBe(99); // 99,9999
    expect(share(0)).toBe(100);
    expect(share(750000)).toBe(50);
    expect(share(1125000)).toBe(25);
  });

  it('marks a debt that never decreases', () => {
    const view = buildDebtView(
      debt({ monthlyPaymentCents: 3640 }),
      day('2026-10-30'),
    );
    expect(view).toMatchObject({
      neverPaidOff: true,
      monthsRemaining: null,
      payoffDate: null,
      totalInterestRemainingCents: null,
    });
    const repaid = buildDebtView(
      debt({ remainingCents: 0 }),
      day('2026-10-30'),
    );
    expect(repaid).toMatchObject({
      neverPaidOff: false,
      monthsRemaining: 0,
      payoffDate: null,
      totalInterestRemainingCents: 0,
    });
  });

  it('lists active debts first, then archived ones, by name', () => {
    const views = buildDebtViews(
      [
        debt({ id: 'a', name: 'Voiture' }),
        debt({ id: 'b', name: 'Ancien', archived: true }),
        debt({ id: 'c', name: 'Maison' }),
      ],
      day('2026-10-30'),
    );
    expect(views.map((v) => v.debt.name)).toEqual([
      'Maison',
      'Voiture',
      'Ancien',
    ]);
  });
});

describe('whatIf', () => {
  const house = debt({
    name: 'Maison',
    kind: 'MORTGAGE',
    principalCents: 12000000,
    remainingCents: 10000000,
    annualRateHundredths: 350,
    monthlyPaymentCents: 58000,
  });
  const today = day('2026-10-30');

  it('simulates an extra monthly payment', () => {
    const result = whatIf(house, 10000, 0, today);
    expect(result.baseline).toEqual({
      monthsRemaining: 240,
      totalInterestRemainingCents: 3918606,
      payoffDate: '2046-10-05',
    });
    expect(result.scenario).toEqual({
      monthsRemaining: 193,
      totalInterestRemainingCents: 3080395,
      payoffDate: '2042-11-05',
    });
    expect(result.interestSavedCents).toBe(3918606 - 3080395);
    expect(result.monthsSaved).toBe(47);
    expect(result.note).toBe(
      'Vérifiez les indemnités de remboursement anticipé de votre contrat.',
    );
  });

  it('simulates a partial immediate repayment, and both together', () => {
    const lump = whatIf(house, 0, 2000000, today);
    expect(lump.scenario).toMatchObject({
      monthsRemaining: 177,
      totalInterestRemainingCents: 2249401,
    });
    expect(lump.monthsSaved).toBe(63);
    expect(lump.interestSavedCents).toBe(3918606 - 2249401);
    const both = whatIf(house, 10000, 2000000, today);
    expect(both.scenario).toMatchObject({
      monthsRemaining: 145,
      totalInterestRemainingCents: 1812835,
    });
    expect(both.monthsSaved).toBe(95);
  });

  it('caps the amounts at the remaining capital', () => {
    // Le versement supplémentaire dépasse le capital : un seul mois, 29 167 d'intérêts.
    const capped = whatIf(house, 99999999999, 0, today);
    expect(capped.scenario).toEqual({
      monthsRemaining: 1,
      totalInterestRemainingCents: 29167,
      payoffDate: '2026-11-05',
    });
    // Un remboursement partiel égal ou supérieur au capital solde tout de suite.
    for (const lump of [10000000, 99999999999]) {
      const all = whatIf(house, 0, lump, today);
      expect(all.scenario).toEqual({
        monthsRemaining: 0,
        totalInterestRemainingCents: 0,
        payoffDate: null,
      });
      expect(all.monthsSaved).toBe(240);
      expect(all.interestSavedCents).toBe(3918606);
    }
  });

  it('never promises a negative saving, even for one extra cent', () => {
    const tiny = whatIf(house, 1, 0, today);
    expect(tiny.scenario).toMatchObject({
      monthsRemaining: 240,
      totalInterestRemainingCents: 3918514,
    });
    expect(tiny.interestSavedCents).toBe(92);
    expect(tiny.monthsSaved).toBe(0);
    for (const [extra, lump] of [
      [1, 0],
      [0, 1],
      [5, 5],
      [100000, 0],
    ]) {
      const r = whatIf(house, extra, lump, today);
      expect(r.interestSavedCents).toBeGreaterThanOrEqual(0);
      expect(r.monthsSaved).toBeGreaterThanOrEqual(0);
    }
  });

  it('compares nothing when the current schedule never ends, but shows the scenario', () => {
    const stuck = debt({
      remainingCents: 10000000,
      principalCents: 12000000,
      annualRateHundredths: 360,
      monthlyPaymentCents: 30000,
    });
    const result = whatIf(stuck, 10000, 0, today);
    expect(result.baseline).toEqual({
      monthsRemaining: null,
      totalInterestRemainingCents: null,
      payoffDate: null,
      neverPaidOff: true,
    });
    expect(result.scenario).toMatchObject({
      monthsRemaining: 463,
      totalInterestRemainingCents: 8511643,
    });
    expect(result.interestSavedCents).toBeNull();
    expect(result.monthsSaved).toBeNull();
    const lump = whatIf(stuck, 0, 2000000, today);
    expect(lump.scenario).toMatchObject({
      monthsRemaining: 538,
      totalInterestRemainingCents: 8118497,
    });
  });

  it('keeps a scenario that still never ends flagged', () => {
    const stuck = debt({
      remainingCents: 10000000,
      principalCents: 12000000,
      annualRateHundredths: 360,
      monthlyPaymentCents: 20000,
    });
    const result = whatIf(stuck, 5000, 0, today); // 250 € < 300 € d'intérêts
    expect(result.scenario).toMatchObject({
      neverPaidOff: true,
      monthsRemaining: null,
    });
    expect(result.interestSavedCents).toBeNull();
  });
});

describe('summarizeDebts', () => {
  const views = buildDebtViews(
    [
      debt({
        id: 'h',
        name: 'Maison',
        kind: 'MORTGAGE',
        principalCents: 25000000,
        remainingCents: 20000000,
        monthlyPaymentCents: 100000,
        insuranceMonthlyCents: 5000,
        annualRateHundredths: 350,
      }),
      debt({ id: 'c', name: 'Voiture' }),
      debt({
        id: 'a',
        name: 'Archivé',
        archived: true,
        monthlyPaymentCents: 99999,
      }),
      debt({
        id: 'z',
        name: 'Soldé',
        remainingCents: 0,
        monthlyPaymentCents: 88888,
      }),
    ],
    day('2026-10-30'),
  );

  it('sums remaining capital and payments + insurance of the active debts only', () => {
    expect(summarizeDebts(views, 450000)).toEqual({
      activeCount: 2,
      totalRemainingCents: 20000000 + 1120000,
      // (100 000 + 5 000) + (32 000 + 1 500)
      totalMonthlyCents: 138500,
      debtToIncomePercent: 31, // 30,78
    });
  });

  it('rounds the ratio to the nearest integer, half up, and is null without income', () => {
    const ratio = (income: number | null) =>
      summarizeDebts(views, income).debtToIncomePercent;
    expect(ratio(395714)).toBe(35); // 35,0000x
    expect(ratio((138500 * 100) / 35.5)).toBe(36);
    expect(ratio(277000)).toBe(50);
    expect(ratio(1385000)).toBe(10);
    expect(ratio(0)).toBeNull();
    expect(ratio(null)).toBeNull();
    expect(ratio(-5)).toBeNull();
  });

  it('is empty and zero without active debts', () => {
    expect(summarizeDebts([], 300000)).toEqual({
      activeCount: 0,
      totalRemainingCents: 0,
      totalMonthlyCents: 0,
      debtToIncomePercent: 0,
    });
    expect(summarizeDebts([], null).debtToIncomePercent).toBeNull();
  });
});
