import { describe, expect, it } from 'vitest';
import {
  buildRecurringPayload,
  describePeriod,
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
