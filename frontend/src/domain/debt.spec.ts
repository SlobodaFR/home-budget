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
  describeGuarantee,
  describeInsurance,
  describeInsuranceSaved,
  describeMonthly,
  describeMonthlyTotal,
  describeNeverPaidOff,
  describePaymentCheck,
  describeTerm,
  hasContractDetails,
  knownLenders,
  lenderLabel,
  parseInitialTerm,
  parsePaymentCheck,
  RATE_TYPE_HELP,
  rateTypeLabel,
  rateTypeWarning,
  QUOTITY_HELP,
  GUARANTEE_NONE_ERROR,
  TERM_ERROR,
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
  ...emptyDebtForm(NOW),
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

/** Le corps attendu quand aucun champ de la tranche 12 n'est renseigné : les valeurs par défaut du contrat. */
const CONTRACT_DEFAULTS = {
  lender: '',
  contractReference: '',
  initialTermMonths: null,
  rateType: null,
  insuranceMode: 'FIXED',
  insuranceRatePercent: null,
  insuranceQuotityPercent: 100,
  feesCents: 0,
  guaranteeKind: 'NONE',
  guaranteeCents: 0,
  notes: '',
};

describe('parseDebt', () => {
  it('reads a complete debt', () => {
    expect(parseDebt(rawDebt)).toEqual({
      ...rawDebt,
      neverPaidOff: false,
      ...CONTRACT_DEFAULTS,
      monthlyInsuranceCents: 1500,
      monthlyTotalCents: 33500,
      remainingInsuranceCents: null,
      remainingCostCents: null,
      paymentCheck: { status: 'UNKNOWN', expectedMonthlyPaymentCents: null, differenceCents: null, differencePercent: null },
    });
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
      totalMonthlyInsuranceCents: 0,
      totalRemainingCostCents: null,
      byLender: [],
    });
  });

  it('keeps an unknown ratio as null and zeroes what is missing', () => {
    expect(parseDebtsSummary({ activeCount: 1, debtToIncomePercent: null }).debtToIncomePercent).toBeNull();
    expect(parseDebtsSummary(null)).toEqual({
      activeCount: 0,
      totalRemainingCents: 0,
      totalMonthlyCents: 0,
      debtToIncomePercent: null,
      totalMonthlyInsuranceCents: 0,
      totalRemainingCostCents: null,
      byLender: [],
    });
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
    expect(plain(describeMonthly(debt({ monthlyInsuranceCents: 0 })))).toBe('320 € par mois');
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
        ...CONTRACT_DEFAULTS,
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
    expect(debtToForm(debt({ insuranceMonthlyCents: 0, monthlyInsuranceCents: 0 })).insurance).toBe('');
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
    expect(parseWhatIf(raw)).toEqual({ ...raw, insuranceSavedCents: null });
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

// ---------------------------------------------------------------------------------------------------------------------
// Tranche 12 : prêts enrichis
// ---------------------------------------------------------------------------------------------------------------------

describe('parseDebt (contract fields)', () => {
  const full = {
    ...rawDebt,
    lender: '  Crédit Agricole ',
    contractReference: 'PRET-12345',
    initialTermMonths: 240,
    rateType: 'VARIABLE',
    insuranceMode: 'PERCENT_REMAINING',
    insuranceRatePercent: 0.3,
    insuranceQuotityPercent: 200,
    feesCents: 90000,
    guaranteeKind: 'SURETY',
    guaranteeCents: 150000,
    notes: 'Remboursement anticipé : 3 % max.',
    monthlyInsuranceCents: 1500,
    monthlyTotalCents: 33500,
    remainingInsuranceCents: 57000,
    remainingCostCents: 153000,
    paymentCheck: { status: 'OK', expectedMonthlyPaymentCents: 31950, differenceCents: 50, differencePercent: 0 },
  };

  it('reads every new field', () => {
    expect(parseDebt(full)).toMatchObject({
      lender: 'Crédit Agricole',
      contractReference: 'PRET-12345',
      initialTermMonths: 240,
      rateType: 'VARIABLE',
      insuranceMode: 'PERCENT_REMAINING',
      insuranceRatePercent: 0.3,
      insuranceQuotityPercent: 200,
      feesCents: 90000,
      guaranteeKind: 'SURETY',
      guaranteeCents: 150000,
      notes: 'Remboursement anticipé : 3 % max.',
      remainingInsuranceCents: 57000,
      remainingCostCents: 153000,
      paymentCheck: { status: 'OK', expectedMonthlyPaymentCents: 31950, differenceCents: 50, differencePercent: 0 },
    });
  });

  it('uses the contract defaults when an older backend sends none of them', () => {
    expect(parseDebt(rawDebt)).toMatchObject(CONTRACT_DEFAULTS);
  });

  it('ignores unknown or out-of-range values instead of failing', () => {
    expect(
      parseDebt({ ...rawDebt, rateType: 'MAGIC', insuranceMode: 'WEIRD', guaranteeKind: 'LOL', initialTermMonths: 1200, insuranceQuotityPercent: 'x', lender: 12, notes: null }),
    ).toMatchObject({ rateType: null, insuranceMode: 'FIXED', guaranteeKind: 'NONE', initialTermMonths: null, insuranceQuotityPercent: 100, lender: '', notes: '' });
    expect(parseDebt({ ...rawDebt, initialTermMonths: 24.5 })?.initialTermMonths).toBeNull();
    expect(parseDebt({ ...rawDebt, initialTermMonths: 0 })?.initialTermMonths).toBeNull();
    expect(parseDebt({ ...rawDebt, insuranceQuotityPercent: 500 })?.insuranceQuotityPercent).toBe(200);
    expect(parseDebt({ ...rawDebt, insuranceQuotityPercent: 0 })?.insuranceQuotityPercent).toBe(1);
  });

  it('computes the missing monthly figures from what it has', () => {
    expect(parseDebt({ ...rawDebt })).toMatchObject({ monthlyInsuranceCents: 1500, monthlyTotalCents: 33500 });
    // 15 000 € × 0,36 % × 200 % = 108 € par an, soit 9 € par mois (900 centimes).
    expect(parseDebt({ ...rawDebt, insuranceMode: 'PERCENT_INITIAL', insuranceRatePercent: 0.36, insuranceQuotityPercent: 200, insuranceMonthlyCents: 0 })).toMatchObject({
      monthlyInsuranceCents: 900,
      monthlyTotalCents: 32900,
    });
    // Sur le capital restant : 11 200 € × 0,3 % = 33,60 € par an, soit 2,80 € par mois (280 centimes).
    expect(parseDebt({ ...rawDebt, insuranceMode: 'PERCENT_REMAINING', insuranceRatePercent: 0.3, insuranceMonthlyCents: 0 })?.monthlyInsuranceCents).toBe(280);
  });

  it('prefers the figures computed by the server', () => {
    expect(parseDebt({ ...rawDebt, monthlyInsuranceCents: 1234, monthlyTotalCents: 33434 })).toMatchObject({ monthlyInsuranceCents: 1234, monthlyTotalCents: 33434 });
  });

  it('drops the remaining cost of a debt that never ends', () => {
    expect(parseDebt({ ...rawDebt, neverPaidOff: true, remainingInsuranceCents: 5, remainingCostCents: 9 })).toMatchObject({ remainingInsuranceCents: null, remainingCostCents: null });
  });
});

describe('parsePaymentCheck', () => {
  it('reads OK and GAP', () => {
    expect(parsePaymentCheck({ status: 'GAP', expectedMonthlyPaymentCents: 28500, differenceCents: 3500, differencePercent: 12 })).toEqual({
      status: 'GAP',
      expectedMonthlyPaymentCents: 28500,
      differenceCents: 3500,
      differencePercent: 12,
    });
    expect(parsePaymentCheck({ status: 'OK' })).toMatchObject({ status: 'OK', expectedMonthlyPaymentCents: null });
  });

  it('never invents an alert: anything unreadable is « unknown »', () => {
    for (const raw of [undefined, null, {}, { status: 'UNKNOWN' }, { status: 'gap' }, { status: 42 }, 'GAP']) {
      expect(parsePaymentCheck(raw).status).toBe('UNKNOWN');
    }
  });
});

describe('contract wording', () => {
  it('writes the total monthly amount only when there is an insurance', () => {
    expect(plain(describeMonthlyTotal(debt()))).toBe('335 € par mois au total');
    expect(describeMonthlyTotal(debt({ monthlyInsuranceCents: 0 }))).toBeNull();
  });

  it('writes a term in months and in years', () => {
    expect(describeTerm(240)).toBe('240 mois (20 ans)');
    expect(describeTerm(18)).toBe('18 mois (1 an et 6 mois)');
    expect(describeTerm(6)).toBe('6 mois');
  });

  it('labels the rate type and warns for the ones that move', () => {
    expect([null, 'FIXED', 'VARIABLE', 'ADJUSTABLE'].map((type) => rateTypeLabel(type as never))).toEqual(['Non précisé', 'Fixe', 'Variable', 'Révisable']);
    expect(rateTypeWarning(null)).toBeNull();
    expect(rateTypeWarning('FIXED')).toBeNull();
    expect(rateTypeWarning('VARIABLE')).toContain('Taux variable');
    expect(rateTypeWarning('ADJUSTABLE')).toContain('Taux révisable');
    expect(rateTypeWarning('ADJUSTABLE')).toContain('supposent un taux fixe');
    expect(RATE_TYPE_HELP).toBe('Les calculs supposent un taux fixe ; avec un taux variable ou révisable, ils restent des estimations.');
  });

  it('describes the insurance in each mode', () => {
    expect(plain(describeInsurance(debt()))).toBe('15 € par mois');
    expect(describeInsurance(debt({ monthlyInsuranceCents: 0 }))).toBe('Aucune assurance renseignée');
    expect(plain(describeInsurance(debt({ insuranceMode: 'PERCENT_INITIAL', insuranceRatePercent: 0.36, monthlyInsuranceCents: 4500 })))).toBe(
      '0,36 % du capital emprunté par an (environ 45 € par mois)',
    );
    expect(plain(describeInsurance(debt({ insuranceMode: 'PERCENT_REMAINING', insuranceRatePercent: 0.3, insuranceQuotityPercent: 200, monthlyInsuranceCents: 5600 })))).toBe(
      '0,3 % du capital restant dû par an, quotité 200 % (environ 56 € par mois)',
    );
  });

  it('describes the guarantee', () => {
    expect(plain(describeGuarantee(debt({ guaranteeKind: 'SURETY', guaranteeCents: 150000 })))).toBe('Caution · 1 500 €');
    expect(describeGuarantee(debt({ guaranteeKind: 'MORTGAGE' }))).toBe('Hypothèque');
    expect(describeGuarantee(debt())).toBe('Aucune');
  });

  it('labels lenders and suggests the known ones once each', () => {
    expect(lenderLabel('')).toBe('Prêteur non précisé');
    expect(lenderLabel('  ')).toBe('Prêteur non précisé');
    expect(lenderLabel('LCL')).toBe('LCL');
    expect(knownLenders([{ lender: 'LCL' }, { lender: '' }, { lender: 'lcl' }, { lender: ' Crédit Agricole ' }, { lender: 'Banque Postale' }])).toEqual(['Banque Postale', 'Crédit Agricole', 'LCL']);
    expect(knownLenders([])).toEqual([]);
  });
});

describe('describePaymentCheck', () => {
  const gap = { status: 'GAP', expectedMonthlyPaymentCents: 28500, differenceCents: 3500, differencePercent: 12 } as const;

  it('explains a gap with both amounts and invites to re-check, never to renegotiate or buy back', () => {
    const message = describePaymentCheck(debt({ paymentCheck: gap }));
    expect(message.level).toBe('gap');
    expect(plain(message.text)).toBe(
      'La mensualité saisie (320 €) ne correspond pas à ce que donneraient le capital, le taux et la durée d’origine (285 €) : vérifiez votre saisie ou la durée.',
    );
    expect(message.text).not.toMatch(/renégoci|rachat|racheter/i);
  });

  it('still writes the gap when the expected amount is missing', () => {
    const message = describePaymentCheck(debt({ paymentCheck: { ...gap, expectedMonthlyPaymentCents: null } }));
    expect(plain(message.text)).toBe('La mensualité saisie (320 €) ne correspond pas à ce que donneraient le capital, le taux et la durée d’origine : vérifiez votre saisie ou la durée.');
  });

  it('is reassuring when consistent', () => {
    expect(describePaymentCheck(debt({ paymentCheck: { ...gap, status: 'OK' } })).level).toBe('ok');
  });

  it('says what is missing when it cannot check, without any alarm', () => {
    expect(describePaymentCheck(debt())).toEqual({ level: 'unknown', text: expect.stringContaining('indiquez la durée initiale') });
    const variable = describePaymentCheck(debt({ initialTermMonths: 240, rateType: 'VARIABLE' }));
    expect(variable.level).toBe('unknown');
    expect(variable.text).toContain('taux variable ou révisable');
    expect(describePaymentCheck(debt({ initialTermMonths: 240 })).level).toBe('unknown');
  });
});

describe('parseInitialTerm', () => {
  const months = (termMonths: string) => parseInitialTerm({ termUnit: 'MONTHS', termMonths, termYears: '', termExtraMonths: '' });
  const years = (termYears: string, termExtraMonths = '') => parseInitialTerm({ termUnit: 'YEARS', termMonths: '', termYears, termExtraMonths });

  it('reads months, or years and months, as months', () => {
    expect(months('240')).toEqual({ ok: true, months: 240 });
    expect(years('20')).toEqual({ ok: true, months: 240 });
    expect(years('3', '2')).toEqual({ ok: true, months: 38 });
    expect(years('', '18')).toEqual({ ok: true, months: 18 });
  });

  it('accepts only 1 to 600 months', () => {
    expect(months('1')).toEqual({ ok: true, months: 1 });
    expect(months('600')).toEqual({ ok: true, months: 600 });
    expect(months('0')).toEqual({ ok: false });
    expect(months('601')).toEqual({ ok: false });
    expect(years('50')).toEqual({ ok: true, months: 600 });
    expect(years('50', '1')).toEqual({ ok: false });
    expect(years('0', '0')).toEqual({ ok: false });
  });

  it('refuses decimals and text, and treats an empty entry as « not given »', () => {
    expect(months('12,5')).toEqual({ ok: false });
    expect(months('abc')).toEqual({ ok: false });
    expect(years('2', 'x')).toEqual({ ok: false });
    expect(months('')).toEqual({ ok: true, months: null });
    expect(years('', '')).toEqual({ ok: true, months: null });
  });
});

describe('buildDebtPayload (contract fields)', () => {
  const payloadOf = (overrides: Partial<DebtFormValues>) => {
    const result = buildDebtPayload(validForm(overrides));
    return result.ok ? result.payload : null;
  };
  const errorsOf = (overrides: Partial<DebtFormValues>) => {
    const result = buildDebtPayload(validForm(overrides));
    return result.ok ? null : result.errors;
  };

  it('sends the lender and the reference trimmed, with 80 and 60 characters at most', () => {
    expect(payloadOf({ lender: '  Crédit Agricole ', contractReference: ' PRET-1 ' })).toMatchObject({ lender: 'Crédit Agricole', contractReference: 'PRET-1' });
    expect(payloadOf({ lender: 'a'.repeat(80), contractReference: 'b'.repeat(60) })).not.toBeNull();
    expect(errorsOf({ lender: 'a'.repeat(81) })?.lender).toContain('80');
    expect(errorsOf({ contractReference: 'b'.repeat(61) })?.contractReference).toContain('60');
  });

  it('sends the initial term in months, from either way of typing it', () => {
    expect(payloadOf({ termUnit: 'MONTHS', termMonths: '240' })?.initialTermMonths).toBe(240);
    expect(payloadOf({ termUnit: 'YEARS', termYears: '20', termExtraMonths: '6' })?.initialTermMonths).toBe(246);
    expect(payloadOf({})?.initialTermMonths).toBeNull();
    expect(errorsOf({ termMonths: '601' })?.term).toBe(TERM_ERROR);
    expect(errorsOf({ termMonths: '0' })?.term).toBe(TERM_ERROR);
    expect(errorsOf({ termUnit: 'YEARS', termYears: '51' })?.term).toBe(TERM_ERROR);
  });

  it('keeps the rate type, empty meaning « not given »', () => {
    expect(payloadOf({ rateType: '' })?.rateType).toBeNull();
    expect(payloadOf({ rateType: 'ADJUSTABLE' })?.rateType).toBe('ADJUSTABLE');
  });

  it('fixed insurance: sends the monthly amount, no rate, quotity 100', () => {
    expect(payloadOf({ insuranceMode: 'FIXED', insurance: '15', insuranceRate: '9', insuranceQuotity: '150' })).toMatchObject({
      insuranceMode: 'FIXED',
      insuranceMonthlyCents: 1500,
      insuranceRatePercent: null,
      insuranceQuotityPercent: 100,
    });
  });

  it('percentage insurance: sends the annual rate and the quotity, and ignores the fixed amount', () => {
    expect(payloadOf({ insuranceMode: 'PERCENT_INITIAL', insuranceRate: '0,36', insuranceQuotity: '200', insurance: '15' })).toMatchObject({
      insuranceMode: 'PERCENT_INITIAL',
      insuranceMonthlyCents: 0,
      insuranceRatePercent: 0.36,
      insuranceQuotityPercent: 200,
    });
    expect(payloadOf({ insuranceMode: 'PERCENT_REMAINING', insuranceRate: '0.3' })).toMatchObject({ insuranceMode: 'PERCENT_REMAINING', insuranceRatePercent: 0.3, insuranceQuotityPercent: 100 });
  });

  it('percentage insurance: quotity is empty = 100, otherwise a whole number from 1 to 200', () => {
    expect(payloadOf({ insuranceMode: 'PERCENT_INITIAL', insuranceRate: '0,3', insuranceQuotity: '' })?.insuranceQuotityPercent).toBe(100);
    expect(payloadOf({ insuranceMode: 'PERCENT_INITIAL', insuranceRate: '0,3', insuranceQuotity: '1' })?.insuranceQuotityPercent).toBe(1);
    for (const insuranceQuotity of ['0', '201', '50,5', 'x', '-10']) {
      expect(errorsOf({ insuranceMode: 'PERCENT_INITIAL', insuranceRate: '0,3', insuranceQuotity })?.insuranceQuotity, insuranceQuotity).toContain('entre 1 et 200');
    }
  });

  it('percentage insurance: the annual rate is required, 0 to 20 with 2 decimals at most', () => {
    expect(errorsOf({ insuranceMode: 'PERCENT_INITIAL', insuranceRate: '' })?.insuranceRate).toContain('Indiquez le taux annuel de l’assurance');
    expect(payloadOf({ insuranceMode: 'PERCENT_INITIAL', insuranceRate: '0' })?.insuranceRatePercent).toBe(0);
    expect(payloadOf({ insuranceMode: 'PERCENT_INITIAL', insuranceRate: '20' })?.insuranceRatePercent).toBe(20);
    expect(errorsOf({ insuranceMode: 'PERCENT_INITIAL', insuranceRate: '20,01' })?.insuranceRate).toContain('entre 0 et 20');
    expect(errorsOf({ insuranceMode: 'PERCENT_REMAINING', insuranceRate: '0,305' })?.insuranceRate).toContain('2 décimales');
    expect(errorsOf({ insuranceMode: 'PERCENT_REMAINING', insuranceRate: 'abc' })?.insuranceRate).toContain('invalide');
  });

  it('does not complain about the fields of a mode that is not selected', () => {
    expect(errorsOf({ insuranceMode: 'FIXED', insuranceRate: 'abc', insuranceQuotity: '999' })).toBeNull();
    expect(errorsOf({ insuranceMode: 'PERCENT_INITIAL', insuranceRate: '0,3', insurance: 'abc' })).toBeNull();
  });

  it('fees and guarantee: empty = 0, amounts in cents', () => {
    expect(payloadOf({})).toMatchObject({ feesCents: 0, guaranteeKind: 'NONE', guaranteeCents: 0 });
    expect(payloadOf({ fees: '900', guaranteeKind: 'SURETY', guarantee: '1 500,50' })).toMatchObject({ feesCents: 90000, guaranteeKind: 'SURETY', guaranteeCents: 150050 });
    expect(errorsOf({ fees: '9,999' })?.fees).toContain('Montant invalide');
    expect(errorsOf({ guaranteeKind: 'MORTGAGE', guarantee: 'beaucoup' })?.guarantee).toContain('Montant invalide');
  });

  it('refuses a guarantee amount above 0 when the guarantee is « Aucune »', () => {
    expect(errorsOf({ guaranteeKind: 'NONE', guarantee: '100' })?.guarantee).toBe(GUARANTEE_NONE_ERROR);
    expect(payloadOf({ guaranteeKind: 'NONE', guarantee: '0' })).toMatchObject({ guaranteeKind: 'NONE', guaranteeCents: 0 });
    expect(payloadOf({ guaranteeKind: 'OTHER', guarantee: '100' })?.guaranteeCents).toBe(10000);
    expect(payloadOf({ guaranteeKind: 'MORTGAGE', guarantee: '' })).toMatchObject({ guaranteeKind: 'MORTGAGE', guaranteeCents: 0 });
  });

  it('notes: trimmed, 500 characters at most', () => {
    expect(payloadOf({ notes: '  Remboursement anticipé : 3 % max.  ' })?.notes).toBe('Remboursement anticipé : 3 % max.');
    expect(payloadOf({ notes: 'n'.repeat(500) })).not.toBeNull();
    expect(errorsOf({ notes: 'n'.repeat(501) })?.notes).toContain('500');
  });

  it('keeps explaining the quotity with the two-borrowers example', () => {
    expect(QUOTITY_HELP).toContain('Deux emprunteurs assurés chacun à 100 % : 200 %');
  });
});

describe('form helpers (contract fields)', () => {
  it('starts with the contract defaults', () => {
    expect(emptyDebtForm(NOW)).toMatchObject({ lender: '', termUnit: 'MONTHS', termMonths: '', rateType: '', insuranceMode: 'FIXED', insuranceQuotity: '100', guaranteeKind: 'NONE', notes: '' });
  });

  it('round-trips a detailed debt through the form', () => {
    const detailed = debt({
      lender: 'Crédit Agricole',
      contractReference: 'PRET-12345',
      initialTermMonths: 246,
      rateType: 'ADJUSTABLE',
      insuranceMode: 'PERCENT_REMAINING',
      insuranceRatePercent: 0.3,
      insuranceQuotityPercent: 200,
      insuranceMonthlyCents: 0,
      feesCents: 90050,
      guaranteeKind: 'SURETY',
      guaranteeCents: 150000,
      notes: 'Remboursement anticipé : 3 % max.',
    });
    const form = debtToForm(detailed);
    expect(form).toMatchObject({
      lender: 'Crédit Agricole',
      termUnit: 'YEARS',
      termYears: '20',
      termExtraMonths: '6',
      rateType: 'ADJUSTABLE',
      insuranceMode: 'PERCENT_REMAINING',
      insuranceRate: '0,3',
      insuranceQuotity: '200',
      insurance: '',
      fees: '900,50',
      guaranteeKind: 'SURETY',
      guarantee: '1500',
    });
    expect(buildDebtPayload(form)).toMatchObject({
      ok: true,
      payload: {
        lender: 'Crédit Agricole',
        initialTermMonths: 246,
        rateType: 'ADJUSTABLE',
        insuranceMode: 'PERCENT_REMAINING',
        insuranceRatePercent: 0.3,
        insuranceQuotityPercent: 200,
        feesCents: 90050,
        guaranteeKind: 'SURETY',
        guaranteeCents: 150000,
        notes: 'Remboursement anticipé : 3 % max.',
      },
    });
  });

  it('types a short term in months and a long one in years', () => {
    expect(debtToForm(debt({ initialTermMonths: 10 }))).toMatchObject({ termUnit: 'MONTHS', termMonths: '10', termYears: '' });
    expect(debtToForm(debt({ initialTermMonths: 240 }))).toMatchObject({ termUnit: 'YEARS', termYears: '20', termExtraMonths: '' });
    expect(debtToForm(debt({ initialTermMonths: null }))).toMatchObject({ termUnit: 'MONTHS', termMonths: '' });
  });

  it('keeps every contract field when building the payload of an archive', () => {
    expect(debtToPayload(debt({ lender: 'LCL', initialTermMonths: 120, guaranteeKind: 'MORTGAGE', guaranteeCents: 50000 }), { archived: true })).toMatchObject({
      lender: 'LCL',
      initialTermMonths: 120,
      guaranteeKind: 'MORTGAGE',
      guaranteeCents: 50000,
      insuranceMode: 'FIXED',
      archived: true,
    });
  });

  it('opens the optional block only when it already holds something', () => {
    const empty = emptyDebtForm(NOW);
    expect(hasContractDetails(empty)).toBe(false);
    expect(hasContractDetails({ ...empty, notes: 'x' })).toBe(true);
    expect(hasContractDetails({ ...empty, fees: '10' })).toBe(true);
    expect(hasContractDetails({ ...empty, guaranteeKind: 'OTHER' })).toBe(true);
    expect(hasContractDetails({ ...empty, contractReference: 'R' })).toBe(true);
  });
});

describe('parseDebtsSummary (lenders)', () => {
  it('reads the insurance, the remaining cost and the lenders, biggest capital first', () => {
    const summary = parseDebtsSummary({
      activeCount: 3,
      totalRemainingCents: 22000000,
      totalMonthlyCents: 150000,
      debtToIncomePercent: 33,
      totalMonthlyInsuranceCents: 12000,
      totalRemainingCostCents: 4500000,
      byLender: [
        { lender: 'LCL', activeCount: 1, remainingCents: 200000, monthlyTotalCents: 8000 },
        { lender: ' Crédit Agricole ', activeCount: 2, remainingCents: 21800000, monthlyTotalCents: 142000 },
        { lender: null, activeCount: 'x' },
      ],
    });
    expect(summary).toMatchObject({ totalMonthlyInsuranceCents: 12000, totalRemainingCostCents: 4500000 });
    expect(summary.byLender).toEqual([
      { lender: 'Crédit Agricole', activeCount: 2, remainingCents: 21800000, monthlyTotalCents: 142000 },
      { lender: 'LCL', activeCount: 1, remainingCents: 200000, monthlyTotalCents: 8000 },
      { lender: '', activeCount: 0, remainingCents: 0, monthlyTotalCents: 0 },
    ]);
  });

  it('defaults to nothing when the server does not know these figures', () => {
    expect(parseDebtsSummary({ activeCount: 1, byLender: 'oups' })).toMatchObject({ totalMonthlyInsuranceCents: 0, totalRemainingCostCents: null, byLender: [] });
  });
});

describe('what-if (insurance saved)', () => {
  const raw = {
    baseline: { monthsRemaining: 38, totalInterestRemainingCents: 96000, payoffDate: '2029-12-05' },
    scenario: { monthsRemaining: 29, totalInterestRemainingCents: 69000, payoffDate: '2029-03-05' },
    interestSavedCents: 27000,
    monthsSaved: 9,
  };

  it('reads the insurance saved, never negative, null when missing', () => {
    expect(parseWhatIf({ ...raw, insuranceSavedCents: 4300 })?.insuranceSavedCents).toBe(4300);
    expect(parseWhatIf({ ...raw, insuranceSavedCents: -200 })?.insuranceSavedCents).toBe(0);
    expect(parseWhatIf({ ...raw, insuranceSavedCents: null })?.insuranceSavedCents).toBeNull();
    expect(parseWhatIf(raw)?.insuranceSavedCents).toBeNull();
  });

  it('adds the insurance to the savings sentence only when above 0', () => {
    const result = parseWhatIf({ ...raw, insuranceSavedCents: 4300 })!;
    expect(plain(describeWhatIfSavings(result))).toBe('Vous économiseriez 270 € d’intérêts et 9 mois, et environ 43 € d’assurance en moins.');
    expect(plain(describeWhatIfSavings({ ...result, monthsSaved: 0 }))).toBe('Vous économiseriez 270 € d’intérêts et environ 43 € d’assurance en moins.');
    expect(plain(describeWhatIfSavings({ ...result, interestSavedCents: 0 }))).toBe('Vous gagneriez 9 mois, et environ 43 € d’assurance en moins.');
    expect(plain(describeWhatIfSavings({ ...result, interestSavedCents: 0, monthsSaved: 0 }))).toBe('Vous économiseriez environ 43 € d’assurance.');
    expect(plain(describeWhatIfSavings({ ...result, insuranceSavedCents: 0 }))).toBe('Vous économiseriez 270 € d’intérêts et 9 mois.');
    expect(plain(describeWhatIfSavings({ ...result, insuranceSavedCents: null }))).toBe('Vous économiseriez 270 € d’intérêts et 9 mois.');
    expect(plain(describeWhatIfSavings({ ...result, insuranceSavedCents: -500 }))).not.toMatch(/-|−|assurance/);
  });

  it('describes the insurance saved on its own', () => {
    expect(plain(describeInsuranceSaved(4300) ?? '')).toBe('environ 43 € d’assurance en moins');
    expect(describeInsuranceSaved(0)).toBeNull();
    expect(describeInsuranceSaved(-3)).toBeNull();
    expect(describeInsuranceSaved(null)).toBeNull();
    expect(describeInsuranceSaved(undefined)).toBeNull();
  });
});
