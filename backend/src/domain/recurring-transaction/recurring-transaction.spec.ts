import { Money } from '../shared/money';
import { RecurringTransaction } from './recurring-transaction';

describe('RecurringTransaction', () => {
  const baseProps = {
    id: 'rt-1',
    accountId: 'acc-1',
    label: 'Loyer',
    category: 'Logement' as const,
    amount: Money.fromEuros(-800),
    startDate: new Date('2026-01-01'),
    endDate: null,
    active: true,
  };

  it('rejects a zero amount', () => {
    expect(() =>
      RecurringTransaction.create({ ...baseProps, amount: Money.zero(), dayOfMonth: 5 }),
    ).toThrow();
  });

  it('rejects an out-of-range day of month', () => {
    expect(() => RecurringTransaction.create({ ...baseProps, dayOfMonth: 32 })).toThrow();
    expect(() => RecurringTransaction.create({ ...baseProps, dayOfMonth: 0 })).toThrow();
  });

  it('rejects an end date before the start date', () => {
    expect(() =>
      RecurringTransaction.create({
        ...baseProps,
        dayOfMonth: 5,
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-01-01'),
      }),
    ).toThrow();
  });

  it('projects monthly occurrences on the given day', () => {
    const rt = RecurringTransaction.create({ ...baseProps, dayOfMonth: 5 });

    const occurrences = rt.occurrencesBetween(new Date('2026-06-10'), new Date('2026-09-30'));

    expect(occurrences.map((d) => d.toISOString().slice(0, 10))).toEqual([
      '2026-07-05',
      '2026-08-05',
      '2026-09-05',
    ]);
  });

  it('clamps the day of month to the last day of shorter months', () => {
    const rt = RecurringTransaction.create({ ...baseProps, dayOfMonth: 31 });

    const occurrences = rt.occurrencesBetween(new Date('2026-01-31'), new Date('2026-02-28'));

    expect(occurrences.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-02-28']);
  });

  it('falls back to the last day of the month when no day is set (estimate)', () => {
    const rt = RecurringTransaction.create({ ...baseProps, dayOfMonth: null });

    const occurrences = rt.occurrencesBetween(new Date('2026-06-10'), new Date('2026-06-30'));

    expect(occurrences.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-06-30']);
  });

  it('excludes occurrences before the start date or after the end date', () => {
    const rt = RecurringTransaction.create({
      ...baseProps,
      dayOfMonth: 15,
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-04-30'),
    });

    const occurrences = rt.occurrencesBetween(new Date('2026-01-01'), new Date('2026-12-31'));

    expect(occurrences.map((d) => d.toISOString().slice(0, 10))).toEqual([
      '2026-03-15',
      '2026-04-15',
    ]);
  });

  it('returns nothing for an inactive recurring transaction', () => {
    const rt = RecurringTransaction.create({ ...baseProps, dayOfMonth: 5, active: false });

    expect(rt.occurrencesBetween(new Date('2026-01-01'), new Date('2026-12-31'))).toEqual([]);
  });
});
