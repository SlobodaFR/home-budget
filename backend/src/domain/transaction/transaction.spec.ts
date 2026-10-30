import { DomainError } from '../shared/domain-error';
import { Money } from '../shared/money';
import { Transaction, TransactionProps } from './transaction';

const base: TransactionProps = {
  id: 't1',
  spaceId: 'common',
  kind: 'INCOME',
  bloc: null,
  label: 'Contribution de Alice',
  amount: Money.fromCents(120000),
  date: new Date('2026-11-03T10:00:00Z'),
};

describe('Transaction contribution fields', () => {
  it('defaults to null for an ordinary operation', () => {
    const t = Transaction.create(base);
    expect(t.contributionUserId).toBeNull();
    expect(t.contributionMonth).toBeNull();
  });

  it('carries the member and the month of a contribution income', () => {
    const t = Transaction.create({
      ...base,
      contributionUserId: 'alice',
      contributionMonth: '2026-11',
    });
    expect(t.contributionUserId).toBe('alice');
    expect(t.contributionMonth).toBe('2026-11');
  });

  it('requires the member and the month together', () => {
    expect(() =>
      Transaction.create({ ...base, contributionUserId: 'alice' }),
    ).toThrow(DomainError);
    expect(() =>
      Transaction.create({ ...base, contributionMonth: '2026-11' }),
    ).toThrow(DomainError);
  });

  it('only allows an income, with a valid month', () => {
    expect(() =>
      Transaction.create({
        ...base,
        kind: 'EXPENSE',
        bloc: 'FIXE',
        contributionUserId: 'alice',
        contributionMonth: '2026-11',
      }),
    ).toThrow(/revenu/);
    expect(() =>
      Transaction.create({
        ...base,
        contributionUserId: 'alice',
        contributionMonth: '2026-13',
      }),
    ).toThrow(DomainError);
  });
});
