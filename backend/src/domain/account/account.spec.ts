import { Money } from '../shared/money';
import { Account } from './account';
import { AccountType } from './account-type.enum';

describe('Account', () => {
  it('creates an expense account with a monthly budget', () => {
    const account = Account.create({
      id: 'acc-1',
      userId: 'user-1',
      name: 'Compte Prelevements 1',
      type: AccountType.EXPENSE,
      icon: 'account_balance_wallet',
      monthlyBudget: Money.fromEuros(1500),
    });

    expect(account.isSource()).toBe(false);
    expect(account.monthlyBudget?.toEuros()).toBe(1500);
  });

  it('rejects an expense account without a monthly budget', () => {
    expect(() =>
      Account.create({
        id: 'acc-1',
        userId: 'user-1',
        name: 'Compte Prelevements 1',
        type: AccountType.EXPENSE,
        icon: 'account_balance_wallet',
        monthlyBudget: null,
      }),
    ).toThrow();
  });

  it('rejects a source account with a monthly budget', () => {
    expect(() =>
      Account.create({
        id: 'acc-4',
        userId: 'user-1',
        name: 'Compte Entrees',
        type: AccountType.SOURCE,
        icon: 'bolt',
        monthlyBudget: Money.fromEuros(100),
      }),
    ).toThrow();
  });

  it('rejects an empty name', () => {
    expect(() =>
      Account.create({
        id: 'acc-1',
        userId: 'user-1',
        name: '   ',
        type: AccountType.SOURCE,
        icon: 'bolt',
        monthlyBudget: null,
      }),
    ).toThrow();
  });
});
