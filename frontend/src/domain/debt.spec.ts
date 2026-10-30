import { describe, expect, it } from 'vitest';
import { RecurringPayment } from './recurring';
import {
  activeDebts,
  archivedDebts,
  buildDebtPayload,
  buildWhatIfQuery,
  DEBT_RATIO_EXPLANATION,
  debtRatioLevel,
  DebtFormValues,
  debtToForm,
  debtToPayload,
  DEFAULT_WHAT_IF_NOTE,
  describeDebtRatio,
  describeMonthly,
  describeNeverPaidOff,
  describePaidProgress,
  describePayoff,
  describeScenarioDuration,
  describeTimeLeft,
  describeWhatIfSavings,
  emptyDebtForm,
  formatMonths,
  formatRate,
  formatYearsAndMonths,
  linkableRecurring,
  monthlyInterestCents,
  parseDebt,
  parseDebts,
  parseDebtsSummary,
  parseRatePercent,
  parseWhatIf,
  ratioGaugePercent,
  REMAINING_HELP,
  sortDebts,
  totalMonthlyCents,
  WHAT_IF_NEEDS_ONE,
  Debt,
} from './debt';

const NOW = new Date(2026, 9, 30, 9, 0, 0);

/** Les montants formatés contiennent des espaces insécables : on les ramène à des espaces simples. */
const plain = (value: string | null | undefined) => (value ?? '').replace(/[\s  ]/g, ' ');

const rawDebt = {
  id: 'd1',
  spaceId: 's1',
  name: 'Prêt auto',
  kind: 'CAR',
  principalCents: 1500000,
  remainingCents: 1120000,
  annualRatePercent: 3.9,
  monthlyPaymentCents: 32000,
  startDate: '2024-09-01',
  paymentDay: 5,
  insuranceMonthlyCents: 1500,
  monthsRemaining: 38,
  payoffDate: '2029-12-05',
  totalInterestRemainingCents: 96000,
  paidSharePercent: 25,
  archived: false,
  recurringId: null,
};

const debt = (overrides: Partial<Debt> = {}): Debt => ({ ...(parseDebt(rawDebt) as Debt), ...overrides });

const validForm = (overrides: Partial<DebtFormValues> = {}): DebtFormValues => ({
  name: 'Prêt auto',
  kind: 'CAR',
  principal: '15 000',
  remaining: '11 200',
  rate: '3,9',
  monthlyPayment: '320',
  insurance: '15',
  startDate: '2024-09-01',
  paymentDay: '5',
  recurringId: '',
  ...overrides,
});

describe('parseDebt', () => {
  it('reads a complete debt', () => {
    expect(parseDebt(rawDebt)).toEqual({ ...rawDebt, neverPaidOff: false });
  });

  it('flags a debt that never gets paid off, with no estimate', () => {
    const parsed = parseDebt({ ...rawDebt, monthsRemaining: null, payoffDate: null, totalInterestRemainingCents: null, neverPaidOff: true });
    expect(parsed).toMatchObject({ neverPaidOff: true, monthsRemaining: null, payoffDate: null, totalInterestRemainingCents: null });
  });

  it('trusts only the explicit flag: missing estimates alone never raise a false alarm', () => {
    expect(parseDebt({ ...rawDebt, monthsRemaining: null, payoffDate: null, totalInterestRemainingCents: null })?.neverPaidOff).toBe(false);
    expect(parseDebt({ ...rawDebt, neverPaidOff: 'yes' })?.neverPaidOff).toBe(false);
  });

  it('drops the estimates of a debt flagged as never paid off, even if the server sent some', () => {
    expect(parseDebt({ ...rawDebt, neverPaidOff: true })).toMatchObject({ neverPaidOff: true, monthsRemaining: null, payoffDate: null, totalInterestRemainingCents: null });
  });

  it('fills in what the server forgot instead of assuming', () => {
    const parsed = parseDebt({ id: 'x', name: 'Minimal', principalCents: 100000, remainingCents: 25000 });
    expect(parsed).toMatchObject({
      kind: 'OTHER',
      annualRatePercent: 0,
      monthlyPaymentCents: 0,
      insuranceMonthlyCents: 0,
      paidSharePercent: 75,
      archived: false,
      recurringId: null,
      startDate: '',
      spaceId: '',
    });
  });

  it('defaults the remaining capital to the principal and clamps a wrong percentage', () => {
    expect(parseDebt({ id: 'x', name: 'n', principalCents: 1000 })?.remainingCents).toBe(1000);
    expect(parseDebt({ ...rawDebt, paidSharePercent: 250 })?.paidSharePercent).toBe(100);
    expect(parseDebt({ ...rawDebt, paidSharePercent: -3 })?.paidSharePercent).toBe(0);
  });

  it('rejects an entry without id, name or principal', () => {
    expect(parseDebt(null)).toBeNull();
    expect(parseDebt({ name: 'x', principalCents: 1 })).toBeNull();
    expect(parseDebt({ id: 'x', principalCents: 1 })).toBeNull();
    expect(parseDebt({ id: 'x', name: 'x' })).toBeNull();
  });

  it('ignores an unknown kind and a broken date', () => {
    const parsed = parseDebt({ ...rawDebt, kind: 'MAGIC', payoffDate: '2029-02-31', startDate: 'hier' });
    expect(parsed).toMatchObject({ kind: 'OTHER', startDate: '' });
  });
});

describe('parseDebts and sortDebts', () => {
  it('keeps the readable ones, active first, never-paid-off first, then the biggest capital', () => {
    const list = parseDebts([
      { ...rawDebt, id: 'small', name: 'Petit', remainingCents: 100000 },
      { ...rawDebt, id: 'archived', name: 'Ancien', archived: true, remainingCents: 9000000 },
      { ...rawDebt, id: 'stuck', name: 'Bloqué', remainingCents: 50000, monthsRemaining: null, payoffDate: null, totalInterestRemainingCents: null, neverPaidOff: true },
      { ...rawDebt, id: 'big', name: 'Gros', remainingCents: 8000000 },
      { nope: true },
    ]);
    expect(list.map((item) => item.id)).toEqual(['stuck', 'big', 'small', 'archived']);
  });

  it('returns an empty list for anything that is not a list', () => {
    expect(parseDebts(null)).toEqual([]);
    expect(parseDebts({ debts: [] })).toEqual([]);
  });

  it('splits active and archived', () => {
    const list = sortDebts([debt({ id: 'a' }), debt({ id: 'b', archived: true })]);
    expect(activeDebts(list).map((item) => item.id)).toEqual(['a']);
    expect(archivedDebts(list).map((item) => item.id)).toEqual(['b']);
  });
});

describe('parseDebtsSummary', () => {
  it('reads the summary', () => {
    expect(parseDebtsSummary({ activeCount: 2, totalRemainingCents: 21800000, totalMonthlyCents: 112000, debtToIncomePercent: 31 })).toEqual({
      activeCount: 2,
      totalRemainingCents: 21800000,
      totalMonthlyCents: 112000,
      debtToIncomePercent: 31,
    });
  });

  it('keeps an unknown ratio as null and zeroes what is missing', () => {
    expect(parseDebtsSummary({ activeCount: 1, debtToIncomePercent: null }).debtToIncomePercent).toBeNull();
    expect(parseDebtsSummary(null)).toEqual({ activeCount: 0, totalRemainingCents: 0, totalMonthlyCents: 0, debtToIncomePercent: null });
  });
});

describe('wording', () => {
  it('formats rates the French way, up to two decimals', () => {
    expect(formatRate(3.9)).toBe('3,9 %');
    expect(formatRate(0)).toBe('0 %');
    expect(formatRate(4)).toBe('4 %');
    expect(formatRate(2.25)).toBe('2,25 %');
  });

  it('formats durations', () => {
    expect(formatMonths(38)).toBe('38 mois');
    expect(formatMonths(1)).toBe('1 mois');
    expect(formatMonths(0)).toBe('moins d’un mois');
    expect(formatYearsAndMonths(38)).toBe('3 ans et 2 mois');
    expect(formatYearsAndMonths(24)).toBe('2 ans');
    expect(formatYearsAndMonths(12)).toBe('1 an');
    expect(formatYearsAndMonths(11)).toBeNull();
    expect(describeTimeLeft(38)).toBe('dans 38 mois (3 ans et 2 mois)');
    expect(describeTimeLeft(6)).toBe('dans 6 mois');
    expect(describeTimeLeft(0)).toBe('ce mois-ci');
  });

  it('writes the payoff line, or nothing when the debt never ends or is repaid', () => {
    expect(describePayoff(debt())).toBe('Fin prévue le 5 décembre 2029 · dans 38 mois (3 ans et 2 mois)');
    expect(describePayoff(debt({ neverPaidOff: true, monthsRemaining: null, payoffDate: null }))).toBeNull();
    expect(describePayoff(debt({ remainingCents: 0 }))).toBeNull();
  });

  it('writes the monthly payment with the insurance only when there is one', () => {
    expect(plain(describeMonthly(debt()))).toBe('320 € par mois, plus 15 € d’assurance');
    expect(plain(describeMonthly(debt({ insuranceMonthlyCents: 0 })))).toBe('320 € par mois');
    expect(totalMonthlyCents(debt())).toBe(33500);
  });

  it('writes the repaid share as text', () => {
    expect(plain(describePaidProgress(debt()))).toBe('Déjà remboursé : 25 % — 3 800 € sur 15 000 €');
  });

  it('explains a debt that never goes down, with the monthly interest as an estimate', () => {
    const stuck = debt({ remainingCents: 10000000, annualRatePercent: 6, monthlyPaymentCents: 40000, neverPaidOff: true });
    expect(monthlyInterestCents(stuck)).toBe(50000);
    const text = plain(describeNeverPaidOff(stuck));
    expect(text).toContain('Cette mensualité ne couvre pas les intérêts');
    expect(text).toContain('500 €');
    expect(text).toContain('400 €');
  });
});

describe('debt ratio', () => {
  it('compares with the 35 % reference without treating it as law', () => {
    expect(debtRatioLevel(null)).toBe('unknown');
    expect(debtRatioLevel(31)).toBe('below');
    expect(debtRatioLevel(35)).toBe('at');
    expect(debtRatioLevel(36)).toBe('above');
    expect(DEBT_RATIO_EXPLANATION).toContain('pas une règle de droit');
  });

  it('always writes a sentence', () => {
    expect(describeDebtRatio(31)).toBe('31 % de vos revenus partent en mensualités : c’est sous le repère courant de 35 %.');
    expect(describeDebtRatio(35)).toContain('pile le repère courant de 35 %');
    expect(describeDebtRatio(42)).toBe('42 % de vos revenus partent en mensualités : c’est au-dessus du repère courant de 35 %.');
    expect(describeDebtRatio(null)).toContain('renseignez votre revenu');
  });

  it('places the gauge between 0 and twice the reference', () => {
    expect(ratioGaugePercent(0)).toBe(0);
    expect(ratioGaugePercent(35)).toBe(50);
    expect(ratioGaugePercent(70)).toBe(100);
    expect(ratioGaugePercent(120)).toBe(100);
  });
});

describe('parseRatePercent', () => {
  it.each([
    ['3,9', 3.9],
    ['3.9', 3.9],
    ['3,90', 3.9],
    ['0', 0],
    ['4 %', 4],
    ['100', 100],
    [',5', 0.5],
    ['2.25', 2.25],
    ['3,', 3],
  ])('reads %s', (input, expected) => {
    expect(parseRatePercent(input)).toBe(expected);
  });

  it.each(['', 'abc', '-1', '3,999', '1,2,3', '3%%x', '3;5'])('refuses %j', (input) => {
    expect(parseRatePercent(input)).toBeNull();
  });
});

describe('buildDebtPayload', () => {
  it('builds the payload in cents with a rate as a number', () => {
    expect(buildDebtPayload(validForm())).toEqual({
      ok: true,
      payload: {
        name: 'Prêt auto',
        kind: 'CAR',
        principalCents: 1500000,
        remainingCents: 1120000,
        annualRatePercent: 3.9,
        monthlyPaymentCents: 32000,
        startDate: '2024-09-01',
        paymentDay: 5,
        insuranceMonthlyCents: 1500,
        recurringId: null,
      },
    });
  });

  it('accepts a rate with a point or a comma, 0 and 100', () => {
    for (const [rate, expected] of [['3.9', 3.9], ['3,9', 3.9], ['0', 0], ['100', 100]] as const) {
      const result = buildDebtPayload(validForm({ rate }));
      expect(result.ok && result.payload.annualRatePercent).toBe(expected);
    }
  });

  it('treats an empty insurance as 0 and links the chosen recurring payment', () => {
    const result = buildDebtPayload(validForm({ insurance: '', recurringId: 'r1' }));
    expect(result).toMatchObject({ ok: true, payload: { insuranceMonthlyCents: 0, recurringId: 'r1' } });
  });

  it('trims the name and refuses an empty or too long one (1 to 60)', () => {
    expect(buildDebtPayload(validForm({ name: '  Prêt  ' }))).toMatchObject({ ok: true, payload: { name: 'Prêt' } });
    expect(buildDebtPayload(validForm({ name: '   ' }))).toEqual({ ok: false, errors: { name: 'Donnez un nom à ce crédit (ex. Prêt auto).' } });
    expect(buildDebtPayload(validForm({ name: 'a'.repeat(60) })).ok).toBe(true);
    expect(buildDebtPayload(validForm({ name: 'a'.repeat(61) }))).toMatchObject({ ok: false, errors: { name: expect.stringContaining('60 caractères') } });
  });

  it('requires a borrowed capital above 0', () => {
    expect(buildDebtPayload(validForm({ principal: '' }))).toMatchObject({ ok: false, errors: { principal: expect.stringContaining('capital emprunté') } });
    expect(buildDebtPayload(validForm({ principal: '0', remaining: '0' }))).toMatchObject({ ok: false, errors: { principal: 'Le capital emprunté doit être supérieur à 0.' } });
    expect(buildDebtPayload(validForm({ principal: 'abc' }))).toMatchObject({ ok: false, errors: { principal: expect.stringContaining('Montant invalide') } });
  });

  it('refuses a remaining capital above the borrowed one, and explains where to find it when missing', () => {
    expect(buildDebtPayload(validForm({ principal: '10 000', remaining: '10 000,01' }))).toEqual({
      ok: false,
      errors: { remaining: 'Le capital restant ne peut pas dépasser le capital emprunté.' },
    });
    expect(buildDebtPayload(validForm({ principal: '10 000', remaining: '10 000' })).ok).toBe(true);
    expect(buildDebtPayload(validForm({ remaining: '' }))).toMatchObject({ ok: false, errors: { remaining: expect.stringContaining('Indiquez le capital restant dû') } });
    expect(REMAINING_HELP).toBe('Le capital restant figure sur votre tableau d’amortissement ou sur le relevé de la banque.');
  });

  it('accepts a fully repaid debt (remaining 0)', () => {
    expect(buildDebtPayload(validForm({ remaining: '0' }))).toMatchObject({ ok: true, payload: { remainingCents: 0 } });
  });

  it('keeps the rate between 0 and 100 with at most 2 decimals', () => {
    expect(buildDebtPayload(validForm({ rate: '' }))).toMatchObject({ ok: false, errors: { rate: expect.stringContaining('0 si le crédit est sans intérêts') } });
    expect(buildDebtPayload(validForm({ rate: '100,01' }))).toMatchObject({ ok: false, errors: { rate: 'Le taux doit être compris entre 0 et 100 %.' } });
    expect(buildDebtPayload(validForm({ rate: '3,999' }))).toMatchObject({ ok: false, errors: { rate: expect.stringContaining('2 décimales') } });
    expect(buildDebtPayload(validForm({ rate: '-1' }))).toMatchObject({ ok: false, errors: { rate: expect.stringContaining('Taux invalide') } });
  });

  it('requires a monthly payment above 0 and a valid insurance', () => {
    expect(buildDebtPayload(validForm({ monthlyPayment: '' }))).toMatchObject({ ok: false, errors: { monthlyPayment: expect.stringContaining('mensualité') } });
    expect(buildDebtPayload(validForm({ monthlyPayment: '0' }))).toMatchObject({ ok: false, errors: { monthlyPayment: 'La mensualité doit être supérieure à 0.' } });
    expect(buildDebtPayload(validForm({ insurance: 'x' }))).toMatchObject({ ok: false, errors: { insurance: expect.stringContaining('Montant invalide') } });
    expect(buildDebtPayload(validForm({ insurance: '0' }))).toMatchObject({ ok: true, payload: { insuranceMonthlyCents: 0 } });
  });

  it('requires a valid start date', () => {
    expect(buildDebtPayload(validForm({ startDate: '' }))).toMatchObject({ ok: false, errors: { startDate: expect.stringContaining('date de début') } });
    expect(buildDebtPayload(validForm({ startDate: '2024-02-30' }))).toMatchObject({ ok: false });
  });

  it('keeps the payment day between 1 and 28', () => {
    for (const value of ['1', '28', ' 15 ']) {
      expect(buildDebtPayload(validForm({ paymentDay: value })).ok).toBe(true);
    }
    for (const value of ['', '0', '29', '31', 'x', '1,5', '-3']) {
      expect(buildDebtPayload(validForm({ paymentDay: value }))).toMatchObject({ ok: false, errors: { paymentDay: 'Choisissez un jour de prélèvement entre 1 et 28.' } });
    }
  });

  it('reports every error at once', () => {
    const result = buildDebtPayload({ ...emptyDebtForm(NOW), startDate: '' });
    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual(['monthlyPayment', 'name', 'principal', 'rate', 'remaining', 'startDate']);
  });
});

describe('form helpers', () => {
  it('starts with today’s date and a payment day within 1 to 28', () => {
    expect(emptyDebtForm(NOW)).toMatchObject({ kind: 'CONSUMER', startDate: '2026-10-30', paymentDay: '28', recurringId: '' });
    expect(emptyDebtForm(new Date(2026, 9, 5)).paymentDay).toBe('5');
  });

  it('fills the form from a debt and round-trips through the payload', () => {
    const form = debtToForm(debt({ recurringId: 'r1' }));
    expect(form).toMatchObject({ principal: '15000', remaining: '11200', rate: '3,9', monthlyPayment: '320', insurance: '15', paymentDay: '5', recurringId: 'r1' });
    const result = buildDebtPayload(form);
    expect(result).toMatchObject({ ok: true, payload: { principalCents: 1500000, remainingCents: 1120000, annualRatePercent: 3.9, recurringId: 'r1' } });
    expect(debtToForm(debt({ insuranceMonthlyCents: 0 })).insurance).toBe('');
  });

  it('builds an archive payload from a debt', () => {
    expect(debtToPayload(debt(), { archived: true })).toMatchObject({ name: 'Prêt auto', recurringId: null, archived: true, monthlyPaymentCents: 32000 });
  });
});

describe('linkableRecurring', () => {
  const recurring = (overrides: Partial<RecurringPayment>): RecurringPayment => ({
    id: 'r',
    spaceId: 's1',
    kind: 'EXPENSE',
    bloc: 'FIXE',
    label: 'Prêt',
    amountCents: 32000,
    dayOfMonth: 5,
    startDate: '2024-09-01',
    endDate: null,
    active: true,
    aidRuleId: null,
    ...overrides,
  });

  it('lists the active expenses only', () => {
    const items = [recurring({ id: 'a' }), recurring({ id: 'b', active: false }), recurring({ id: 'c', kind: 'INCOME' })];
    expect(linkableRecurring(items, null).map((item) => item.id)).toEqual(['a']);
  });

  it('keeps the one already linked, even inactive, so it is not lost', () => {
    const items = [recurring({ id: 'a' }), recurring({ id: 'b', active: false })];
    expect(linkableRecurring(items, 'b').map((item) => item.id)).toEqual(['a', 'b']);
  });
});

describe('what-if', () => {
  const raw = {
    baseline: { monthsRemaining: 38, totalInterestRemainingCents: 96000, payoffDate: '2029-12-05' },
    scenario: { monthsRemaining: 29, totalInterestRemainingCents: 69000, payoffDate: '2029-03-05' },
    interestSavedCents: 27000,
    monthsSaved: 9,
    note: 'Vérifiez les indemnités de remboursement anticipé de votre contrat.',
  };

  it('reads the result and keeps the server note', () => {
    expect(parseWhatIf(raw)).toEqual(raw);
    expect(parseWhatIf({ ...raw, note: 'Autre note.' })?.note).toBe('Autre note.');
  });

  it('falls back on the default note when the server forgets it', () => {
    expect(parseWhatIf({ ...raw, note: undefined })?.note).toBe(DEFAULT_WHAT_IF_NOTE);
    expect(parseWhatIf({ ...raw, note: '  ' })?.note).toBe(DEFAULT_WHAT_IF_NOTE);
  });

  it('recomputes the savings when missing and never returns a negative one', () => {
    const noSavings = { baseline: raw.baseline, scenario: raw.scenario };
    expect(parseWhatIf(noSavings)).toMatchObject({ interestSavedCents: 27000, monthsSaved: 9 });
    expect(parseWhatIf({ ...raw, interestSavedCents: -500, monthsSaved: -2 })).toMatchObject({ interestSavedCents: 0, monthsSaved: 0 });
  });

  it('rejects an answer without both scenarios', () => {
    expect(parseWhatIf(null)).toBeNull();
    expect(parseWhatIf({ baseline: raw.baseline })).toBeNull();
    expect(parseWhatIf({ baseline: null, scenario: raw.scenario })).toBeNull();
  });

  it('accepts a baseline that never ends', () => {
    const result = parseWhatIf({ ...raw, baseline: { monthsRemaining: null, totalInterestRemainingCents: null, payoffDate: null }, interestSavedCents: 0, monthsSaved: 0 });
    expect(result?.baseline.monthsRemaining).toBeNull();
    expect(describeScenarioDuration(result!.baseline)).toContain('Jamais');
  });

  it('writes the savings in a sentence, never negative', () => {
    const result = parseWhatIf(raw)!;
    expect(plain(describeWhatIfSavings(result))).toBe('Vous économiseriez 270 € d’intérêts et 9 mois.');
    expect(plain(describeWhatIfSavings({ ...result, monthsSaved: 0 }))).toBe('Vous économiseriez 270 € d’intérêts.');
    expect(describeWhatIfSavings({ ...result, interestSavedCents: 0 })).toBe('Vous gagneriez 9 mois.');
    expect(describeWhatIfSavings({ ...result, interestSavedCents: 0, monthsSaved: 0 })).toContain('ne changerait presque rien');
    expect(plain(describeWhatIfSavings({ ...result, interestSavedCents: -9000, monthsSaved: -3 }))).not.toMatch(/-|−/);
  });

  it('says so when the debt did not go down before and now does', () => {
    const result = parseWhatIf({ ...raw, baseline: { monthsRemaining: null, totalInterestRemainingCents: null, payoffDate: null }, interestSavedCents: 0, monthsSaved: 0 })!;
    expect(describeWhatIfSavings(result)).toContain('pourrait être soldé en 29 mois');
  });

  it('requires at least one amount above 0', () => {
    expect(buildWhatIfQuery({ extra: '', lumpSum: '' })).toEqual({ ok: false, errors: { both: WHAT_IF_NEEDS_ONE } });
    expect(buildWhatIfQuery({ extra: '0', lumpSum: '0,00' })).toEqual({ ok: false, errors: { both: WHAT_IF_NEEDS_ONE } });
  });

  it('turns euros into cents, one amount being enough', () => {
    expect(buildWhatIfQuery({ extra: '100', lumpSum: '' })).toEqual({ ok: true, query: { extraMonthlyCents: 10000, lumpSumCents: 0 } });
    expect(buildWhatIfQuery({ extra: '', lumpSum: '2 000,50' })).toEqual({ ok: true, query: { extraMonthlyCents: 0, lumpSumCents: 200050 } });
    expect(buildWhatIfQuery({ extra: '50', lumpSum: '1000' })).toEqual({ ok: true, query: { extraMonthlyCents: 5000, lumpSumCents: 100000 } });
  });

  it('refuses an invalid amount, field by field', () => {
    expect(buildWhatIfQuery({ extra: 'abc', lumpSum: '100' })).toMatchObject({ ok: false, errors: { extra: expect.stringContaining('Montant invalide') } });
    expect(buildWhatIfQuery({ extra: '-5', lumpSum: '' })).toMatchObject({ ok: false, errors: { extra: expect.any(String) } });
    expect(buildWhatIfQuery({ extra: '10', lumpSum: '1,234' })).toMatchObject({ ok: false, errors: { lumpSum: expect.any(String) } });
  });
});
