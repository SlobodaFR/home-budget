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
