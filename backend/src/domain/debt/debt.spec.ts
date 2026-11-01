import { DomainError } from '../shared/domain-error';
import {
  amortize,
  expectedMonthlyPaymentCents,
  insuranceTermsOf,
  monthlyInsuranceCents,
  monthlyInterestCents,
  nextPaymentDate,
  payoffDate,
} from './amortization';
import {
  DEBT_EXTENSION_DEFAULTS,
  Debt,
  DebtProps,
  insuranceRatePercentToHundredths,
  ratePercentToHundredths,
} from './debt';
import {
  buildDebtView,
  buildDebtViews,
  checkPayment,
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
  ...DEBT_EXTENSION_DEFAULTS,
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
      totalInsuranceCents: 0,
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
      totalInsuranceCents: 0,
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
      totalInsuranceCents: null,
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
      totalInsuranceCents: 0,
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
      totalInsuranceCents: 0,
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
      totalMonthlyInsuranceCents: 6500,
      totalRemainingCostCents: 11692788,
      byLender: [
        {
          lender: '',
          activeCount: 2,
          remainingCents: 20000000 + 1120000,
          monthlyTotalCents: 138500,
        },
      ],
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
      totalMonthlyInsuranceCents: 0,
      totalRemainingCostCents: 0,
      byLender: [],
      debtToIncomePercent: 0,
    });
    expect(summarizeDebts([], null).debtToIncomePercent).toBeNull();
  });
});

describe('insuranceRatePercentToHundredths', () => {
  it('converts 0 to 20 % with two decimals at most, without float drift', () => {
    expect(insuranceRatePercentToHundredths(0.36)).toBe(36);
    expect(insuranceRatePercentToHundredths(0.29)).toBe(29); // 28,999999999999996
    expect(insuranceRatePercentToHundredths(0.07)).toBe(7);
    expect(insuranceRatePercentToHundredths(0)).toBe(0);
    expect(insuranceRatePercentToHundredths(20)).toBe(2000);
  });

  it('rejects a third decimal, out-of-range and non-finite values', () => {
    for (const bad of [0.155, 0.001, 1.005, -0.01, 20.01, 21, NaN, Infinity]) {
      expect(() => insuranceRatePercentToHundredths(bad)).toThrow(DomainError);
    }
    expect(() => insuranceRatePercentToHundredths('0.3' as never)).toThrow(
      DomainError,
    );
    expect(() => insuranceRatePercentToHundredths(0.155)).toThrow(
      "Le taux d'assurance accepte 2 décimales au plus",
    );
  });
});

describe('Debt extension (tranche 12)', () => {
  it('takes the contract defaults for an old credit', () => {
    const d = debt();
    expect(d.lender).toBe('');
    expect(d.contractReference).toBe('');
    expect(d.initialTermMonths).toBeNull();
    expect(d.rateType).toBeNull();
    expect(d.insuranceMode).toBe('FIXED');
    expect(d.insuranceRateHundredths).toBeNull();
    expect(d.insuranceQuotityPercent).toBe(100);
    expect(d.feesCents).toBe(0);
    expect(d.guaranteeKind).toBe('NONE');
    expect(d.guaranteeCents).toBe(0);
    expect(d.notes).toBe('');
  });

  it('trims the texts before checking their length', () => {
    const d = debt({
      lender: `  ${'b'.repeat(80)} `,
      contractReference: ` ${'r'.repeat(60)}  `,
      notes: `\n${'n'.repeat(500)} `,
    });
    expect(d.lender).toBe('b'.repeat(80));
    expect(d.contractReference).toBe('r'.repeat(60));
    expect(d.notes).toBe('n'.repeat(500));
  });

  const percent = {
    insuranceMode: 'PERCENT_INITIAL' as const,
    insuranceRateHundredths: 36,
  };
  it.each([
    ['lender of 81 characters', { lender: 'x'.repeat(81) }],
    ['reference of 61 characters', { contractReference: 'x'.repeat(61) }],
    ['notes of 501 characters', { notes: 'x'.repeat(501) }],
    ['term 0', { initialTermMonths: 0 }],
    ['term 601', { initialTermMonths: 601 }],
    ['fractional term', { initialTermMonths: 12.5 }],
    ['unknown rate type', { rateType: 'WEIRD' as never }],
    ['unknown insurance mode', { insuranceMode: 'MAGIC' as never }],
    [
      'percent mode without a rate',
      { insuranceMode: 'PERCENT_REMAINING' as const },
    ],
    [
      'percent mode without a rate (initial)',
      { insuranceMode: 'PERCENT_INITIAL' as const },
    ],
    ['insurance rate in FIXED mode', { insuranceRateHundredths: 36 }],
    [
      'insurance rate above 20 %',
      { ...percent, insuranceRateHundredths: 2001 },
    ],
    ['negative insurance rate', { ...percent, insuranceRateHundredths: -1 }],
    ['fractional insurance rate', { ...percent, insuranceRateHundredths: 3.5 }],
    ['quotity 0', { insuranceQuotityPercent: 0 }],
    ['quotity 201', { insuranceQuotityPercent: 201 }],
    ['fractional quotity', { insuranceQuotityPercent: 99.5 }],
    ['negative fees', { feesCents: -1 }],
    ['fractional fees', { feesCents: 1.5 }],
    ['unknown guarantee kind', { guaranteeKind: 'PLEDGE' as never }],
    [
      'negative guarantee',
      { guaranteeKind: 'SURETY' as const, guaranteeCents: -1 },
    ],
    ['guarantee amount without a kind', { guaranteeCents: 100 }],
  ])('rejects %s', (_label, over) => {
    expect(() => debt(over)).toThrow(DomainError);
  });

  it('accepts the boundaries', () => {
    for (const over of [
      { initialTermMonths: 1 },
      { initialTermMonths: 600 },
      { insuranceQuotityPercent: 1 },
      { insuranceQuotityPercent: 200 },
      { ...percent, insuranceRateHundredths: 0 },
      { ...percent, insuranceRateHundredths: 2000 },
      { rateType: 'VARIABLE' as const },
      { rateType: 'ADJUSTABLE' as const },
      { feesCents: 0, guaranteeKind: 'MORTGAGE' as const, guaranteeCents: 0 },
      { guaranteeKind: 'OTHER' as const, guaranteeCents: 1 },
    ]) {
      expect(() => debt(over)).not.toThrow();
    }
  });

  it('explains the guarantee rule and the missing rate in French', () => {
    expect(() => debt({ guaranteeCents: 100 })).toThrow(
      'Précisez le type de garantie',
    );
    expect(() => debt({ insuranceMode: 'PERCENT_REMAINING' })).toThrow(
      "Indiquez le taux d'assurance",
    );
  });
});

describe('monthlyInsuranceCents (integers, half up)', () => {
  const terms = (over: Partial<DebtProps> = {}) => insuranceTermsOf(debt(over));

  it('FIXED: the entered amount, whatever the quotity and the balance', () => {
    const t = terms({
      insuranceMonthlyCents: 1500,
      insuranceQuotityPercent: 150,
    });
    expect(monthlyInsuranceCents(t, 1120000)).toBe(1500);
    expect(monthlyInsuranceCents(t, 5)).toBe(1500);
  });

  it('PERCENT_INITIAL: borrowed capital × rate × quotity / 12', () => {
    // 200 000 € × 0,36 % = 720 € par an = 60 € par mois.
    const t = terms({
      principalCents: 20000000,
      remainingCents: 15000000,
      insuranceMode: 'PERCENT_INITIAL',
      insuranceRateHundredths: 36,
    });
    expect(monthlyInsuranceCents(t, 15000000)).toBe(6000);
    expect(monthlyInsuranceCents(t, 1)).toBe(6000); // le capital restant ne compte pas
    // Deux emprunteurs assurés chacun à 100 % : le double.
    expect(monthlyInsuranceCents({ ...t, quotityPercent: 200 }, 15000000)).toBe(
      12000,
    );
    // 50 % de quotité : la moitié.
    expect(monthlyInsuranceCents({ ...t, quotityPercent: 50 }, 0)).toBe(3000);
  });

  it('PERCENT_REMAINING: the balance of the month × rate × quotity / 12', () => {
    const t = terms({
      principalCents: 20000000,
      insuranceMode: 'PERCENT_REMAINING',
      insuranceRateHundredths: 36,
    });
    expect(monthlyInsuranceCents(t, 15000000)).toBe(4500); // 150 000 € × 0,36 % / 12
    expect(monthlyInsuranceCents(t, 0)).toBe(0);
  });

  it('rounds exact halves up and everything below down', () => {
    const t = (base: number, rate: number) =>
      monthlyInsuranceCents(
        {
          mode: 'PERCENT_REMAINING',
          fixedMonthlyCents: 0,
          principalCents: base,
          rateHundredths: rate,
          quotityPercent: 100,
        },
        base,
      );
    expect(t(1000, 60)).toBe(1); // 0,5 -> 1
    expect(t(1000, 59)).toBe(0); // 0,4916
    expect(t(1200, 60)).toBe(1); // 0,6
    expect(t(600, 60)).toBe(0); // 0,3
    expect(t(10000, 0)).toBe(0);
  });

  it('stays exact beyond 2^53 (BigInt fallback) for huge amounts', () => {
    // 10 Md€ à 20 % de quotité 200 : 1e12 × 2000 × 200 / 12e6 = 3,3333…e10.
    const t = {
      mode: 'PERCENT_INITIAL' as const,
      fixedMonthlyCents: 0,
      principalCents: 1_000_000_000_000,
      rateHundredths: 2000,
      quotityPercent: 200,
    };
    expect(monthlyInsuranceCents(t, 0)).toBe(33_333_333_333);
  });
});

describe('amortize with insurance', () => {
  const base = (over: Partial<DebtProps>) => insuranceTermsOf(debt(over));

  it('FIXED: the amount for each remaining month (contract example, 38 months)', () => {
    const plan = amortize(
      1120000,
      390,
      32000,
      base({ insuranceMonthlyCents: 1500 }),
    );
    expect(plan.months).toBe(38);
    expect(plan.totalInsuranceCents).toBe(38 * 1500);
  });

  it('PERCENT_INITIAL and PERCENT_REMAINING on a 0 % loan (hand-checked)', () => {
    // 3 000 € à 0 %, 1 000 € par mois : soldes 3 000, 2 000 puis 1 000 €.
    // 12 % par an : l'assurance du mois = solde × 12 % / 12 = 1 % du solde.
    const percent = {
      principalCents: 300000,
      remainingCents: 300000,
      insuranceRateHundredths: 1200,
    };
    const remaining = amortize(
      300000,
      0,
      100000,
      base({ ...percent, insuranceMode: 'PERCENT_REMAINING' }),
    );
    expect(remaining.months).toBe(3);
    expect(remaining.totalInsuranceCents).toBe(3000 + 2000 + 1000);
    const initial = amortize(
      300000,
      0,
      100000,
      base({ ...percent, insuranceMode: 'PERCENT_INITIAL' }),
    );
    expect(initial.totalInsuranceCents).toBe(3 * 3000);
    expect(initial.totalInterestCents).toBe(0);
  });

  it('PERCENT_REMAINING follows the decreasing balance, including the adjusted last month', () => {
    // 2 500 € à 0 %, 1 000 € par mois : soldes 2 500, 1 500, 500 (3 mensualités, la dernière à 500 €).
    const plan = amortize(
      250000,
      0,
      100000,
      base({
        principalCents: 250000,
        remainingCents: 250000,
        insuranceMode: 'PERCENT_REMAINING',
        insuranceRateHundredths: 1200,
      }),
    );
    expect(plan.months).toBe(3);
    expect(plan.lastPaymentCents).toBe(50000);
    expect(plan.totalInsuranceCents).toBe(2500 + 1500 + 500);
  });

  it('is 0 without insurance terms, and null when the debt never ends', () => {
    expect(amortize(1120000, 390, 32000).totalInsuranceCents).toBe(0);
    expect(
      amortize(10000000, 360, 29900, base({ insuranceMonthlyCents: 1500 }))
        .totalInsuranceCents,
    ).toBeNull();
    expect(
      amortize(0, 390, 32000, base({ insuranceMonthlyCents: 1500 }))
        .totalInsuranceCents,
    ).toBe(0);
  });

  it('does not change the interest nor the duration', () => {
    const without = amortize(1120000, 390, 32000);
    const withInsurance = amortize(
      1120000,
      390,
      32000,
      base({ insuranceMonthlyCents: 99999 }),
    );
    expect(withInsurance.months).toBe(without.months);
    expect(withInsurance.totalInterestCents).toBe(without.totalInterestCents);
    expect(withInsurance.lastPaymentCents).toBe(without.lastPaymentCents);
  });
});

describe('expectedMonthlyPaymentCents (bisection on the integer simulation)', () => {
  it('finds the smallest constant payment: 100 000 € at 3,5 % over 240 months = 579,96 €', () => {
    const expected = expectedMonthlyPaymentCents(10000000, 350, 240);
    expect(expected).toBe(57996); // annuité théorique 579,963…
    expect(amortize(10000000, 350, expected).months).toBe(240);
    expect(amortize(10000000, 350, expected - 1).months).toBe(241); // un centime de moins : trop long
  });

  it('handles 0 %: the capital divided by the term, rounded up', () => {
    expect(expectedMonthlyPaymentCents(10000000, 0, 240)).toBe(41667); // 41 666,67
    expect(expectedMonthlyPaymentCents(120000, 0, 12)).toBe(10000);
    expect(expectedMonthlyPaymentCents(100, 0, 600)).toBe(1);
  });

  it('handles a 1-month term: the capital plus the first month interest', () => {
    // 100 000 € à 3,5 % : 291,67 € d'intérêts.
    expect(expectedMonthlyPaymentCents(10000000, 350, 1)).toBe(10029167);
    expect(expectedMonthlyPaymentCents(1, 10000, 1)).toBe(1);
  });

  it('matches known annuities', () => {
    expect(expectedMonthlyPaymentCents(1500000, 390, 60)).toBe(27558);
    expect(expectedMonthlyPaymentCents(1120000, 390, 38)).toBe(31380);
    expect(expectedMonthlyPaymentCents(20000000, 200, 300)).toBe(84771);
  });

  it('terminates on the extreme inputs and never needs more than the 1 200 months cap', () => {
    expect(
      expectedMonthlyPaymentCents(1_000_000_000_000, 10000, 600),
    ).toBeGreaterThan(0);
    expect(expectedMonthlyPaymentCents(1_000_000_000_000, 0, 1)).toBe(
      1_000_000_000_000,
    );
    expect(expectedMonthlyPaymentCents(10000000, 10000, 600)).toBeGreaterThan(
      0,
    );
  });
});

describe('checkPayment', () => {
  const car = (over: Partial<DebtProps> = {}) =>
    debt({
      principalCents: 1500000,
      remainingCents: 1120000,
      annualRateHundredths: 390,
      initialTermMonths: 60,
      rateType: 'FIXED',
      ...over,
    });

  it('is OK when the payment matches the original loan', () => {
    // 15 000 € à 3,9 % sur 60 mois : 275,58 €.
    expect(checkPayment(car({ monthlyPaymentCents: 27558 }))).toEqual({
      status: 'OK',
      expectedMonthlyPaymentCents: 27558,
      differenceCents: 0,
      differencePercent: 0,
    });
    expect(checkPayment(car({ monthlyPaymentCents: 27600 }))).toEqual({
      status: 'OK',
      expectedMonthlyPaymentCents: 27558,
      differenceCents: 42,
      differencePercent: 0, // 0,15 %
    });
  });

  it('flags a very different payment as GAP, with a signed percentage', () => {
    expect(checkPayment(car({ monthlyPaymentCents: 32000 }))).toEqual({
      status: 'GAP',
      expectedMonthlyPaymentCents: 27558,
      differenceCents: 4442,
      differencePercent: 16, // 16,12 %
    });
    expect(checkPayment(car({ monthlyPaymentCents: 13779 }))).toMatchObject({
      status: 'GAP',
      differenceCents: -13779,
      differencePercent: -50,
    });
    expect(checkPayment(car({ monthlyPaymentCents: 0 }))).toMatchObject({
      status: 'GAP',
      differencePercent: -100,
    });
  });

  it('uses an exact 2 % threshold in integers (551 cents OK, 552 GAP)', () => {
    // 2 % de 27 558 = 551,16 cents.
    const status = (payment: number) =>
      checkPayment(car({ monthlyPaymentCents: payment })).status;
    expect(status(27558 + 551)).toBe('OK');
    expect(status(27558 + 552)).toBe('GAP');
    expect(status(27558 - 551)).toBe('OK');
    expect(status(27558 - 552)).toBe('GAP');
    expect(
      checkPayment(car({ monthlyPaymentCents: 27558 + 552 })),
    ).toMatchObject({ differencePercent: 2 });
  });

  it('is UNKNOWN for a variable or adjustable rate, and without a term', () => {
    expect(checkPayment(car({ rateType: 'VARIABLE' }))).toEqual({
      status: 'UNKNOWN',
    });
    expect(checkPayment(car({ rateType: 'ADJUSTABLE' }))).toEqual({
      status: 'UNKNOWN',
    });
    expect(checkPayment(car({ initialTermMonths: null }))).toEqual({
      status: 'UNKNOWN',
    });
    // Taux inconnu (null) : calculé comme un taux fixe.
    expect(checkPayment(car({ rateType: null })).status).toBe('GAP');
  });

  it('works for 0 % and a 1-month term, and ignores the insurance', () => {
    expect(
      checkPayment(
        car({
          annualRateHundredths: 0,
          principalCents: 1200000,
          remainingCents: 1200000,
          initialTermMonths: 12,
          monthlyPaymentCents: 100000,
          insuranceMonthlyCents: 99999,
        }),
      ),
    ).toEqual({
      status: 'OK',
      expectedMonthlyPaymentCents: 100000,
      differenceCents: 0,
      differencePercent: 0,
    });
    expect(
      checkPayment(
        car({
          principalCents: 10000000,
          remainingCents: 10000000,
          annualRateHundredths: 350,
          initialTermMonths: 1,
          monthlyPaymentCents: 10029167,
        }),
      ),
    ).toMatchObject({ status: 'OK', expectedMonthlyPaymentCents: 10029167 });
  });

  it('never alters the entered figures', () => {
    const d = car({ monthlyPaymentCents: 32000 });
    checkPayment(d);
    expect(d.monthlyPaymentCents).toBe(32000);
    expect(d.principalCents).toBe(1500000);
    expect(d.initialTermMonths).toBe(60);
  });
});

describe('debt view indicators (tranche 12)', () => {
  const today = day('2026-10-30');

  it('computes insurance, total and remaining cost for the contract example', () => {
    const view = buildDebtView(
      debt({
        insuranceMonthlyCents: 1500,
        initialTermMonths: 60,
      }),
      today,
    );
    expect(view.monthlyInsuranceCents).toBe(1500);
    expect(view.monthlyTotalCents).toBe(33500);
    expect(view.remainingInsuranceCents).toBe(57000); // 38 mois
    expect(view.remainingCostCents).toBe(70926 + 57000);
  });

  it('uses the balance and the borrowed capital for the percentage modes', () => {
    const initial = buildDebtView(
      debt({
        insuranceMode: 'PERCENT_INITIAL',
        insuranceRateHundredths: 36,
        insuranceMonthlyCents: 0,
      }),
      today,
    );
    // 15 000 € × 0,36 % / 12 = 4,50 €
    expect(initial.monthlyInsuranceCents).toBe(450);
    expect(initial.monthlyTotalCents).toBe(32450);
    expect(initial.remainingInsuranceCents).toBe(38 * 450);
    const remaining = buildDebtView(
      debt({
        insuranceMode: 'PERCENT_REMAINING',
        insuranceRateHundredths: 36,
        insuranceMonthlyCents: 0,
      }),
      today,
    );
    // 11 200 € × 0,36 % / 12 = 3,36 € le premier mois, puis de moins en moins.
    expect(remaining.monthlyInsuranceCents).toBe(336);
    expect(remaining.remainingInsuranceCents!).toBeLessThan(38 * 336);
    expect(remaining.remainingInsuranceCents!).toBeGreaterThan((38 * 336) / 2);
  });

  it('gives nulls for the remaining figures when the debt never ends', () => {
    const view = buildDebtView(debt({ monthlyPaymentCents: 3640 }), today);
    expect(view.neverPaidOff).toBe(true);
    expect(view.remainingInsuranceCents).toBeNull();
    expect(view.remainingCostCents).toBeNull();
    expect(view.monthlyTotalCents).toBe(3640 + 1500);
  });
});

describe('whatIf insuranceSavedCents', () => {
  const today = day('2026-10-30');

  it('compares the remaining insurance of both scenarios (FIXED: fewer months)', () => {
    const d = debt({ insuranceMonthlyCents: 1500 });
    const result = whatIf(d, 5000, 0, today);
    const months = result.scenario.monthsRemaining!;
    expect(months).toBeLessThan(38);
    expect(result.insuranceSavedCents).toBe((38 - months) * 1500);
  });

  it('PERCENT_REMAINING: a lump sum also lowers the monthly insurance', () => {
    // 3 000 € à 0 %, 1 000 € par mois, 1 % du solde par mois : 3 000 + 2 000 + 1 000 = 6 000 cents.
    const d = debt({
      principalCents: 300000,
      remainingCents: 300000,
      annualRateHundredths: 0,
      monthlyPaymentCents: 100000,
      insuranceMode: 'PERCENT_REMAINING',
      insuranceRateHundredths: 1200,
      insuranceMonthlyCents: 0,
    });
    // Acompte de 1 000 € : soldes 2 000 puis 1 000 -> 2 000 + 1 000 = 3 000 cents.
    expect(whatIf(d, 0, 100000, today).insuranceSavedCents).toBe(3000);
    // Tout rembourser : toute l'assurance est économisée.
    expect(whatIf(d, 0, 300000, today).insuranceSavedCents).toBe(6000);
  });

  it('PERCENT_INITIAL: only the number of months matters', () => {
    const d = debt({
      principalCents: 300000,
      remainingCents: 300000,
      annualRateHundredths: 0,
      monthlyPaymentCents: 100000,
      insuranceMode: 'PERCENT_INITIAL',
      insuranceRateHundredths: 1200,
      insuranceMonthlyCents: 0,
    });
    // 3 000 cents par mois ; un versement de 1 000 € de plus supprime 1 mois sur 3... 2 mois (1 000 + 1 000 € x 2 = 3 000)
    const result = whatIf(d, 100000, 0, today);
    expect(result.scenario.monthsRemaining).toBe(2);
    expect(result.insuranceSavedCents).toBe(3000);
  });

  it('is null when a schedule never ends, and never negative', () => {
    const stuck = debt({ monthlyPaymentCents: 3640 });
    expect(whatIf(stuck, 10000, 0, today).insuranceSavedCents).toBeNull();
    const d = debt();
    expect(whatIf(d, 1, 0, today).insuranceSavedCents).toBeGreaterThanOrEqual(
      0,
    );
  });
});

describe('summarizeDebts (tranche 12)', () => {
  const today = day('2026-10-30');
  const house = (over: Partial<DebtProps>) =>
    debt({
      principalCents: 12000000,
      remainingCents: 10000000,
      annualRateHundredths: 350,
      monthlyPaymentCents: 58000,
      ...over,
    });

  it('groups by lender ignoring case and spaces, first label wins, sorted by remaining capital', () => {
    const views = buildDebtViews(
      [
        house({
          id: 'a',
          name: 'A',
          lender: 'Crédit Agricole',
          remainingCents: 10000000,
        }),
        house({
          id: 'b',
          name: 'B',
          lender: '  crédit   AGRICOLE ',
          remainingCents: 2000000,
          monthlyPaymentCents: 20000,
        }),
        house({
          id: 'c',
          name: 'C',
          lender: 'Boursorama',
          remainingCents: 11000000,
          principalCents: 12000000,
        }),
        house({ id: 'd', name: 'D', lender: '', remainingCents: 500000 }),
        house({ id: 'e', name: 'E', lender: '   ', remainingCents: 100000 }),
        house({ id: 'f', name: 'F', lender: 'Boursorama', archived: true }),
        house({ id: 'g', name: 'G', lender: 'Boursorama', remainingCents: 0 }),
      ],
      today,
    );
    const summary = summarizeDebts(views, null);
    expect(
      summary.byLender.map((l) => [l.lender, l.activeCount, l.remainingCents]),
    ).toEqual([
      ['Crédit Agricole', 2, 12000000],
      ['Boursorama', 1, 11000000],
      ['', 2, 600000],
    ]);
    // Le libellé affiché est le premier rencontré (ordre : nom croissant, A avant B).
    // Mensualités + assurance fixe de 15 € chacune.
    expect(summary.byLender[0].monthlyTotalCents).toBe(
      58000 + 1500 + 20000 + 1500,
    );
    expect(summary.activeCount).toBe(5);
  });

  it('adds the insurance, the remaining cost and bases the ratio on the computed monthly total', () => {
    const views = buildDebtViews(
      [
        debt({
          id: 'a',
          name: 'A',
          insuranceMode: 'PERCENT_INITIAL',
          insuranceRateHundredths: 36,
          insuranceMonthlyCents: 0,
        }),
        debt({ id: 'b', name: 'B', monthlyPaymentCents: 3640 }), // ne finit jamais
        debt({ id: 'c', name: 'C', archived: true }),
      ],
      today,
    );
    const summary = summarizeDebts(views, 100000);
    // A : 320 € + 4,50 € ; B : 36,40 € + 15 € (hors coût restant : ne finit jamais).
    expect(summary.totalMonthlyInsuranceCents).toBe(450 + 1500);
    expect(summary.totalMonthlyCents).toBe(32000 + 450 + 3640 + 1500);
    expect(summary.totalRemainingCostCents).toBe(70926 + 38 * 450);
    expect(summary.debtToIncomePercent).toBe(38); // 375,90 / 1 000 = 37,59
  });
});
