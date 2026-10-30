import { describe, expect, it } from 'vitest';
import {
  buildRecurringPayload,
  countNonMonthly,
  describeFrequency,
  describePeriod,
  describeQuarterlyMonths,
  frequencyOf,
  monthlyProvisionCents,
  monthOfYearOf,
  quarterlyMonths,
  describeSchedule,
  emptyRecurringForm,
  monthlyTotals,
  RecurringFormValues,
  RecurringPayment,
  recurringToForm,
  recurringToPayload,
  sortRecurring,
} from './recurring';

const NOW = new Date(2026, 10, 12, 9, 0, 0);

const values = (overrides: Partial<RecurringFormValues> = {}): RecurringFormValues => ({
  ...emptyRecurringForm(NOW),
  label: ' Loyer ',
  amount: '1 100,50',
  dayOfMonth: '5',
  ...overrides,
});

const item = (overrides: Partial<RecurringPayment> = {}): RecurringPayment => ({
  id: 'r1',
  spaceId: 's1',
  kind: 'EXPENSE',
  bloc: 'FIXE',
  label: 'Loyer',
  amountCents: 110000,
  dayOfMonth: 5,
  startDate: '2026-01-01',
  endDate: null,
  active: true,
  aidRuleId: null,
  ...overrides,
});

describe('buildRecurringPayload', () => {
  it('builds an expense in cents with its bloc', () => {
    expect(buildRecurringPayload(values(), { allowAid: false })).toEqual({
      ok: true,
      payload: {
        kind: 'EXPENSE',
        bloc: 'FIXE',
        label: 'Loyer',
        amountCents: 110050,
        dayOfMonth: 5,
        startDate: '2026-11-12',
        endDate: null,
        active: true,
        frequency: 'MONTHLY',
        monthOfYear: null,
      },
    });
  });

  it('builds an income without bloc nor aid, even in the common space', () => {
    const result = buildRecurringPayload(values({ kind: 'INCOME', aidRuleId: 'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE', label: 'Salaire' }), { allowAid: true });
    expect(result.ok && result.payload).toMatchObject({ kind: 'INCOME', aidRuleId: null });
    expect(result.ok && 'bloc' in result.payload).toBe(false);
  });

  it('sends the aid for a common expense, and null when none is chosen', () => {
    const withAid = buildRecurringPayload(values({ aidRuleId: 'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE' }), { allowAid: true });
    expect(withAid.ok && withAid.payload.aidRuleId).toBe('CREDIT_IMPOT_SERVICES_A_LA_PERSONNE');
    const without = buildRecurringPayload(values(), { allowAid: true });
    expect(without.ok && without.payload.aidRuleId).toBeNull();
  });

  it('never sends an aid for the personal space', () => {
    const result = buildRecurringPayload(values({ aidRuleId: 'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE' }), { allowAid: false });
    expect(result.ok && 'aidRuleId' in result.payload).toBe(false);
  });

  it('leaves the day empty when unknown', () => {
    const result = buildRecurringPayload(values({ dayOfMonth: '  ' }), { allowAid: false });
    expect(result.ok && result.payload.dayOfMonth).toBeNull();
  });

  it('keeps an end date on or after the start', () => {
    const result = buildRecurringPayload(values({ endDate: '2026-11-12' }), { allowAid: false });
    expect(result.ok && result.payload.endDate).toBe('2026-11-12');
  });

  it('rejects an empty or too long label', () => {
    expect(buildRecurringPayload(values({ label: '  ' }), { allowAid: false })).toMatchObject({ ok: false, errors: { label: expect.any(String) } });
    expect(buildRecurringPayload(values({ label: 'x'.repeat(81) }), { allowAid: false })).toMatchObject({ ok: false, errors: { label: expect.any(String) } });
  });

  it('rejects an empty, invalid or zero amount', () => {
    for (const amount of ['', 'abc', '0', '-5', '1,234']) {
      expect(buildRecurringPayload(values({ amount }), { allowAid: false })).toMatchObject({ ok: false, errors: { amount: expect.any(String) } });
    }
  });

  it('rejects a day outside 1-31', () => {
    for (const dayOfMonth of ['0', '32', 'x', '1.5', '-3']) {
      expect(buildRecurringPayload(values({ dayOfMonth }), { allowAid: false })).toMatchObject({ ok: false, errors: { dayOfMonth: expect.any(String) } });
    }
    expect(buildRecurringPayload(values({ dayOfMonth: '31' }), { allowAid: false }).ok).toBe(true);
  });

  it('rejects invalid dates and an end before the start', () => {
    expect(buildRecurringPayload(values({ startDate: '' }), { allowAid: false })).toMatchObject({ ok: false, errors: { startDate: expect.any(String) } });
    expect(buildRecurringPayload(values({ endDate: '2026-02-30' }), { allowAid: false })).toMatchObject({ ok: false, errors: { endDate: expect.any(String) } });
    expect(buildRecurringPayload(values({ endDate: '2026-11-11' }), { allowAid: false })).toMatchObject({
      ok: false,
      errors: { endDate: expect.stringContaining('avant') },
    });
  });

  it('reports every error at once', () => {
    const result = buildRecurringPayload(values({ label: '', amount: '', dayOfMonth: '99' }), { allowAid: false });
    expect(result.ok === false && Object.keys(result.errors).sort()).toEqual(['amount', 'dayOfMonth', 'label']);
  });
});

describe('bank account', () => {
  it('sends nothing when no selector is shown and no account is set', () => {
    const result = buildRecurringPayload(values(), { allowAid: false });
    expect(result.ok && 'accountId' in result.payload).toBe(false);
  });

  it('sends the chosen account, in any space', () => {
    const result = buildRecurringPayload(values({ accountId: 'acc-1' }), { allowAid: false, accountSelectable: true });
    expect(result.ok && result.payload.accountId).toBe('acc-1');
  });

  it('sends null when « Aucun » is chosen in a shown selector', () => {
    const result = buildRecurringPayload(values(), { allowAid: false, accountSelectable: true });
    expect(result.ok && result.payload.accountId).toBeNull();
  });

  it('keeps an existing account even when the selector could not be shown', () => {
    const result = buildRecurringPayload(values({ accountId: 'acc-1' }), { allowAid: false });
    expect(result.ok && result.payload.accountId).toBe('acc-1');
  });

  it('keeps the account of an income', () => {
    const result = buildRecurringPayload(values({ kind: 'INCOME', accountId: 'acc-1' }), { allowAid: true, accountSelectable: true });
    expect(result.ok && result.payload).toMatchObject({ kind: 'INCOME', accountId: 'acc-1', aidRuleId: null });
  });

  it('keeps the account when pausing a payment', () => {
    expect(recurringToPayload(item({ accountId: 'acc-1' }), { active: false })).toMatchObject({ accountId: 'acc-1', active: false });
    expect('accountId' in recurringToPayload(item({ accountId: null }))).toBe(false);
  });

  it('fills the form with the account', () => {
    expect(recurringToForm(item({ accountId: 'acc-1' })).accountId).toBe('acc-1');
    expect(recurringToForm(item()).accountId).toBe('');
  });
});

describe('form conversions', () => {
  it('fills the form from an existing payment', () => {
    expect(recurringToForm(item({ endDate: '2026-12-31', aidRuleId: 'X' }))).toEqual({
      kind: 'EXPENSE',
      bloc: 'FIXE',
      label: 'Loyer',
      amount: '1100',
      dayOfMonth: '5',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      active: true,
      aidRuleId: 'X',
      accountId: '',
      frequency: 'MONTHLY',
      monthOfYear: '1',
    });
  });

  it('round-trips an existing payment through the form', () => {
    const original = item({ amountCents: 123456, dayOfMonth: null, endDate: '2027-01-31' });
    const result = buildRecurringPayload(recurringToForm(original), { allowAid: true });
    expect(result).toMatchObject({ ok: true, payload: { amountCents: 123456, dayOfMonth: null, endDate: '2027-01-31', aidRuleId: null } });
  });

  it('toggles active in a payload while keeping the aid', () => {
    expect(recurringToPayload(item({ aidRuleId: 'X' }), { active: false })).toEqual({
      kind: 'EXPENSE',
      bloc: 'FIXE',
      label: 'Loyer',
      amountCents: 110000,
      dayOfMonth: 5,
      startDate: '2026-01-01',
      endDate: null,
      active: false,
      frequency: 'MONTHLY',
      monthOfYear: null,
      aidRuleId: 'X',
    });
  });

  it('omits bloc for an income', () => {
    expect('bloc' in recurringToPayload(item({ kind: 'INCOME', bloc: null }))).toBe(false);
  });
});

describe('display helpers', () => {
  it('describes the schedule', () => {
    expect(describeSchedule({ dayOfMonth: 5 })).toBe('Le 5 de chaque mois');
    expect(describeSchedule({ dayOfMonth: 1 })).toBe('Le 1er de chaque mois');
    expect(describeSchedule({ dayOfMonth: null })).toMatch(/fin de mois/);
  });

  it('describes the period', () => {
    expect(describePeriod({ startDate: '2026-01-05', endDate: null })).toMatch(/^Depuis le 5 janv\.? 2026$/);
    expect(describePeriod({ startDate: '2026-01-05', endDate: '2026-12-31' })).toMatch(/^Du 5 janv\.? 2026 au 31 déc\.? 2026$/);
  });

  it('sorts active first, incomes before expenses, then by day with unknown last', () => {
    const sorted = sortRecurring([
      item({ id: 'a', label: 'Paused', active: false }),
      item({ id: 'b', label: 'Unknown day', dayOfMonth: null }),
      item({ id: 'c', label: 'Early', dayOfMonth: 2 }),
      item({ id: 'd', label: 'Salaire', kind: 'INCOME', bloc: null, dayOfMonth: 28 }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('totals only active payments', () => {
    expect(
      monthlyTotals([
        item({ amountCents: 1000 }),
        item({ amountCents: 500, active: false }),
        item({ kind: 'INCOME', bloc: null, amountCents: 3000 }),
      ]),
    ).toEqual({ incomeCents: 3000, expenseCents: 1000 });
  });
});

describe('periodicity', () => {
  it('reads a missing or unknown frequency as monthly', () => {
    expect(frequencyOf(item())).toBe('MONTHLY');
    expect(frequencyOf({ frequency: 'WEEKLY' })).toBe('MONTHLY');
    expect(frequencyOf(item({ frequency: 'YEARLY', monthOfYear: 10 }))).toBe('YEARLY');
  });

  it('only keeps a valid month for a non monthly payment', () => {
    expect(monthOfYearOf(item({ frequency: 'YEARLY', monthOfYear: 10 }))).toBe(10);
    expect(monthOfYearOf(item({ frequency: 'YEARLY', monthOfYear: 13 }))).toBeNull();
    expect(monthOfYearOf(item({ frequency: 'YEARLY' }))).toBeNull();
    expect(monthOfYearOf(item({ frequency: 'MONTHLY', monthOfYear: 4 }))).toBeNull();
    expect(monthOfYearOf(item({ monthOfYear: 4 }))).toBeNull();
  });

  it('computes the four months of a quarterly payment, wrapping over the year', () => {
    expect(quarterlyMonths(1)).toEqual([1, 4, 7, 10]);
    expect(quarterlyMonths(11)).toEqual([11, 2, 5, 8]);
    expect(quarterlyMonths(12)).toEqual([12, 3, 6, 9]);
    expect(describeQuarterlyMonths(11)).toBe('Paiements en novembre, février, mai et août');
  });

  it('describes the frequency in plain French', () => {
    expect(describeFrequency(item({ frequency: 'YEARLY', monthOfYear: 10 }))).toBe('Tous les ans en octobre');
    expect(describeFrequency(item({ frequency: 'QUARTERLY', monthOfYear: 11 }))).toBe('Tous les 3 mois à partir de novembre');
    expect(describeFrequency(item())).toBe('Chaque mois');
    expect(describeFrequency(item({ frequency: 'YEARLY', monthOfYear: null }))).toBe('Tous les ans');
    expect(describeFrequency(item({ frequency: 'QUARTERLY', monthOfYear: null }))).toBe('Tous les 3 mois');
  });

  it('describes the schedule of a non monthly payment with its day', () => {
    expect(describeSchedule({ dayOfMonth: 15, frequency: 'YEARLY', monthOfYear: 10 })).toBe('Tous les ans en octobre, le 15');
    expect(describeSchedule({ dayOfMonth: 1, frequency: 'QUARTERLY', monthOfYear: 2 })).toBe('Tous les 3 mois à partir de février, le 1er');
    expect(describeSchedule({ dayOfMonth: null, frequency: 'YEARLY', monthOfYear: 6 })).toBe('Tous les ans en juin, compté en fin de mois');
  });

  it('computes the monthly provision, rounded up', () => {
    expect(monthlyProvisionCents(120000, 'YEARLY')).toBe(10000);
    expect(monthlyProvisionCents(100000, 'YEARLY')).toBe(8334);
    expect(monthlyProvisionCents(30000, 'QUARTERLY')).toBe(10000);
    expect(monthlyProvisionCents(10001, 'QUARTERLY')).toBe(3334);
    expect(monthlyProvisionCents(50000, 'MONTHLY')).toBe(0);
  });

  it('keeps non monthly payments out of the monthly totals and counts the active ones', () => {
    const items = [
      item({ amountCents: 1000 }),
      item({ amountCents: 120000, frequency: 'YEARLY', monthOfYear: 10 }),
      item({ kind: 'INCOME', bloc: null, amountCents: 30000, frequency: 'QUARTERLY', monthOfYear: 1 }),
      item({ amountCents: 5000, frequency: 'YEARLY', monthOfYear: 3, active: false }),
    ];
    expect(monthlyTotals(items)).toEqual({ incomeCents: 0, expenseCents: 1000 });
    expect(countNonMonthly(items)).toBe(2);
  });
});

describe('periodicity in the form', () => {
  it('defaults to monthly with the current month preselected', () => {
    expect(emptyRecurringForm(NOW)).toMatchObject({ frequency: 'MONTHLY', monthOfYear: '11' });
  });

  it('sends frequency YEARLY with its month', () => {
    const result = buildRecurringPayload(values({ frequency: 'YEARLY', monthOfYear: '10', dayOfMonth: '15' }), { allowAid: false });
    expect(result.ok && result.payload).toMatchObject({ frequency: 'YEARLY', monthOfYear: 10, dayOfMonth: 15 });
  });

  it('sends frequency QUARTERLY with its starting month', () => {
    const result = buildRecurringPayload(values({ frequency: 'QUARTERLY', monthOfYear: '11' }), { allowAid: false });
    expect(result.ok && result.payload).toMatchObject({ frequency: 'QUARTERLY', monthOfYear: 11 });
  });

  it('sends a null month for a monthly payment, whatever the month field holds', () => {
    const result = buildRecurringPayload(values({ frequency: 'MONTHLY', monthOfYear: '7' }), { allowAid: false });
    expect(result.ok && result.payload).toMatchObject({ frequency: 'MONTHLY', monthOfYear: null });
  });

  it('allows a non monthly income', () => {
    const result = buildRecurringPayload(
      values({ kind: 'INCOME', label: 'Prime annuelle', frequency: 'YEARLY', monthOfYear: '12' }),
      { allowAid: true },
    );
    expect(result.ok && result.payload).toMatchObject({ kind: 'INCOME', frequency: 'YEARLY', monthOfYear: 12, aidRuleId: null });
  });

  it('rejects a missing or out of range month for a non monthly payment', () => {
    for (const monthOfYear of ['', '0', '13', 'x', '1.5', '-2']) {
      expect(buildRecurringPayload(values({ frequency: 'YEARLY', monthOfYear }), { allowAid: false })).toMatchObject({
        ok: false,
        errors: { monthOfYear: expect.any(String) },
      });
      expect(buildRecurringPayload(values({ frequency: 'QUARTERLY', monthOfYear }), { allowAid: false })).toMatchObject({
        ok: false,
        errors: { monthOfYear: expect.any(String) },
      });
    }
  });

  it('does not ask for a month when monthly', () => {
    expect(buildRecurringPayload(values({ frequency: 'MONTHLY', monthOfYear: '' }), { allowAid: false }).ok).toBe(true);
  });

  it('fills the form from a yearly payment and round-trips it', () => {
    const original = item({ frequency: 'YEARLY', monthOfYear: 10, dayOfMonth: 15, amountCents: 120000 });
    expect(recurringToForm(original)).toMatchObject({ frequency: 'YEARLY', monthOfYear: '10' });
    expect(buildRecurringPayload(recurringToForm(original), { allowAid: false })).toMatchObject({
      ok: true,
      payload: { frequency: 'YEARLY', monthOfYear: 10, amountCents: 120000 },
    });
  });

  it('falls back to the start month when the server sent no month, and to monthly without frequency', () => {
    expect(recurringToForm(item({ startDate: '2026-04-02' })).monthOfYear).toBe('4');
    expect(recurringToForm(item({ startDate: '2026-04-02' })).frequency).toBe('MONTHLY');
  });

  it('keeps frequency and month when pausing a non monthly payment', () => {
    expect(recurringToPayload(item({ frequency: 'QUARTERLY', monthOfYear: 11 }), { active: false })).toMatchObject({
      frequency: 'QUARTERLY',
      monthOfYear: 11,
      active: false,
    });
  });
});
