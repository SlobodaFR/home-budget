import { Money } from '../shared/money';
import { SpacePlan } from '../space/space-plan';
import { Transaction } from '../transaction/transaction';
import { parseMonth } from './month';
import { summarizeMonth } from './month-summary';

function tx(
  id: string,
  kind: 'INCOME' | 'EXPENSE',
  bloc: 'FIXE' | 'COURANT' | 'PLAISIR' | 'EPARGNE' | null,
  euros: number,
) {
  return Transaction.create({
    id,
    spaceId: 'space-1',
    kind,
    bloc,
    label: id,
    amount: Money.fromEuros(euros),
    date: new Date('2026-10-05T00:00:00Z'),
  });
}

describe('summarizeMonth', () => {
  const plan = SpacePlan.create({
    incomeCents: 380000,
    fixeCents: 175000,
    courantCents: 100000,
    plaisirCents: 45000,
    epargneCents: 20000,
  });

  it('compares each bloc to its plan like the course simulator', () => {
    const summary = summarizeMonth('2026-10', plan, [
      tx('salaire', 'INCOME', null, 3800),
      tx('loyer', 'EXPENSE', 'FIXE', 1100),
      tx('edf', 'EXPENSE', 'FIXE', 96),
      tx('courses', 'EXPENSE', 'COURANT', 142.3),
      tx('resto', 'EXPENSE', 'PLAISIR', 64.5),
      tx('livret', 'EXPENSE', 'EPARGNE', 300),
    ]);

    const fixe = summary.blocs.find((b) => b.bloc === 'FIXE');
    expect(fixe).toEqual({
      bloc: 'FIXE',
      plannedCents: 175000,
      actualCents: 119600,
      gapCents: -55400,
    });
    expect(summary.income).toEqual({
      plannedCents: 380000,
      actualCents: 380000,
      gapCents: 0,
    });
    expect(summary.plannedBalanceCents).toBe(40000);
    expect(summary.actualBalanceCents).toBe(
      380000 - 119600 - 14230 - 6450 - 30000,
    );
    expect(summary.savingsRate).toBeCloseTo(300 / 3800, 4);
  });

  it('has no savings rate without income', () => {
    expect(summarizeMonth('2026-10', plan, []).savingsRate).toBeNull();
  });
});

describe('parseMonth', () => {
  it('returns a half-open UTC range', () => {
    const { from, to } = parseMonth('2026-12');
    expect(from.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(to.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('rejects malformed months', () => {
    expect(() => parseMonth('2026-13')).toThrow();
    expect(() => parseMonth('26-10')).toThrow();
  });
});
