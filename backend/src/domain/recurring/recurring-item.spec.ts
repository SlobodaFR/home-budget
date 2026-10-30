import { DomainError } from '../shared/domain-error';
import { Money } from '../shared/money';
import { Space } from '../space/space';
import { RecurringItem, RecurringItemProps } from './recurring-item';

const base: RecurringItemProps = {
  id: 'r1',
  spaceId: 'common',
  kind: 'EXPENSE',
  bloc: 'FIXE',
  label: '  Loyer  ',
  amount: Money.fromCents(110000),
  dayOfMonth: 5,
  startDate: '2026-01-01',
  endDate: null,
  active: true,
  aidRuleId: null,
};

const make = (over: Partial<RecurringItemProps>) =>
  RecurringItem.create({ ...base, ...over });

const common = Space.create({
  id: 'common',
  householdId: 'h',
  kind: 'COMMON',
  ownerUserId: null,
  name: 'Commun',
});
const personal = Space.create({
  id: 'perso',
  householdId: 'h',
  kind: 'PERSONAL',
  ownerUserId: 'alice',
  name: 'Perso',
});

describe('RecurringItem', () => {
  it('trims the label and exposes its fields', () => {
    const item = make({});
    expect(item.label).toBe('Loyer');
    expect(item.amount.toCents()).toBe(110000);
    expect(item.dayOfMonth).toBe(5);
  });

  it.each([
    ['empty label', { label: '   ' }],
    ['label too long', { label: 'x'.repeat(81) }],
    ['zero amount', { amount: Money.fromCents(0) }],
    ['negative amount', { amount: Money.fromCents(-100) }],
    ['expense without bloc', { bloc: null }],
    ['expense with an unknown bloc', { bloc: 'LUXE' as never }],
    ['income with a bloc', { kind: 'INCOME' as const, bloc: 'FIXE' as const }],
    ['day 0', { dayOfMonth: 0 }],
    ['day 32', { dayOfMonth: 32 }],
    ['fractional day', { dayOfMonth: 5.5 }],
    ['impossible start date', { startDate: '2026-02-30' }],
    ['malformed start date', { startDate: '01/01/2026' }],
    ['impossible end date', { endDate: '2026-13-01' }],
    ['end before start', { endDate: '2025-12-31' }],
    ['unknown aid rule', { aidRuleId: 'AUTRE' as never }],
    [
      'aid on an income',
      {
        kind: 'INCOME' as const,
        bloc: null,
        aidRuleId: 'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE' as const,
      },
    ],
  ])('rejects %s', (_name, over) => {
    expect(() => make(over)).toThrow(DomainError);
  });

  it('accepts the boundaries', () => {
    expect(() => make({ dayOfMonth: 1 })).not.toThrow();
    expect(() => make({ dayOfMonth: 31 })).not.toThrow();
    expect(() => make({ dayOfMonth: null })).not.toThrow();
    expect(() => make({ endDate: '2026-01-01' })).not.toThrow();
    expect(() => make({ startDate: '2028-02-29' })).not.toThrow();
    expect(() => make({ startDate: '2026-02-29' })).toThrow(DomainError);
    expect(() =>
      make({ kind: 'INCOME', bloc: null, dayOfMonth: null }),
    ).not.toThrow();
  });

  it('allows an aid rule on a common-space expense only', () => {
    const aided = { aidRuleId: 'CREDIT_IMPOT_GARDE_HORS_DOMICILE' as const };
    expect(
      RecurringItem.createIn(common, { ...base, ...aided }).aidRuleId,
    ).toBe('CREDIT_IMPOT_GARDE_HORS_DOMICILE');
    expect(() =>
      RecurringItem.createIn(personal, { ...base, spaceId: 'perso', ...aided }),
    ).toThrow(/espace commun/);
    expect(() =>
      RecurringItem.createIn(personal, { ...base, spaceId: 'perso' }),
    ).not.toThrow();
  });
});

describe('RecurringItem periodicity', () => {
  it('defaults to MONTHLY without month of year', () => {
    const item = make({});
    expect(item.frequency).toBe('MONTHLY');
    expect(item.monthOfYear).toBeNull();
    expect(item.isNonMonthly()).toBe(false);
    expect(item.monthlyProvisionCents()).toBe(0);
    expect(item.monthlyEquivalentCents()).toBe(110000);
  });

  it('requires a month of year (1-12) for YEARLY and QUARTERLY, and forbids it for MONTHLY', () => {
    for (const frequency of ['YEARLY', 'QUARTERLY'] as const) {
      expect(() => make({ frequency, monthOfYear: 10 })).not.toThrow();
      expect(() => make({ frequency, monthOfYear: 1 })).not.toThrow();
      expect(() => make({ frequency, monthOfYear: 12 })).not.toThrow();
      for (const monthOfYear of [null, undefined, 0, 13, -1, 2.5]) {
        expect(() => make({ frequency, monthOfYear: monthOfYear })).toThrow(
          DomainError,
        );
      }
    }
    expect(() => make({ frequency: 'MONTHLY', monthOfYear: 5 })).toThrow(
      DomainError,
    );
    expect(() =>
      make({ frequency: 'MONTHLY', monthOfYear: null }),
    ).not.toThrow();
    expect(() => make({ frequency: 'WEEKLY' as never })).toThrow(DomainError);
  });

  it('smooths the amount: monthly provision rounds up, monthly equivalent rounds to nearest', () => {
    const yearly = (cents: number) =>
      make({
        frequency: 'YEARLY',
        monthOfYear: 10,
        amount: Money.fromCents(cents),
      });
    const quarterly = (cents: number) =>
      make({
        frequency: 'QUARTERLY',
        monthOfYear: 1,
        amount: Money.fromCents(cents),
      });
    expect(yearly(120000).monthlyProvisionCents()).toBe(10000);
    expect(yearly(100).monthlyProvisionCents()).toBe(9); // 8,33
    expect(yearly(100001).monthlyProvisionCents()).toBe(8334); // 8 333,4
    expect(yearly(1).monthlyProvisionCents()).toBe(1);
    expect(quarterly(30000).monthlyProvisionCents()).toBe(10000);
    expect(quarterly(100).monthlyProvisionCents()).toBe(34); // 33,33
    expect(yearly(100).monthlyEquivalentCents()).toBe(8);
    expect(yearly(120000).monthlyEquivalentCents()).toBe(10000);
    expect(quarterly(100).monthlyEquivalentCents()).toBe(33);
    expect(yearly(100).isNonMonthly()).toBe(true);
  });
});
