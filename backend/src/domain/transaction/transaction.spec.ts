import { Money } from '../shared/money';
import { Transaction } from './transaction';

describe('Transaction', () => {
  const baseProps = {
    id: 'txn-1',
    accountId: 'acc-1',
    label: 'SNCF Voyage',
    category: 'Transport' as const,
    date: new Date('2025-10-12'),
  };

  it('creates a debit transaction', () => {
    const txn = Transaction.create({ ...baseProps, amount: Money.fromEuros(-84.5) });
    expect(txn.isCredit()).toBe(false);
    expect(txn.amount.toEuros()).toBe(-84.5);
  });

  it('creates a credit transaction', () => {
    const txn = Transaction.create({ ...baseProps, amount: Money.fromEuros(2800) });
    expect(txn.isCredit()).toBe(true);
  });

  it('rejects a zero amount', () => {
    expect(() => Transaction.create({ ...baseProps, amount: Money.zero() })).toThrow();
  });

  it('rejects an empty label', () => {
    expect(() =>
      Transaction.create({ ...baseProps, label: '  ', amount: Money.fromEuros(10) }),
    ).toThrow();
  });
});
