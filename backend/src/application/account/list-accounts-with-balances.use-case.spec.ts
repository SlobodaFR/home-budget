import { Account } from '../../domain/account/account';
import { AccountRepository } from '../../domain/account/account.repository';
import { AccountType } from '../../domain/account/account-type.enum';
import { Money } from '../../domain/shared/money';
import { Transaction } from '../../domain/transaction/transaction';
import { TransactionRepository } from '../../domain/transaction/transaction.repository';
import { ListAccountsWithBalancesUseCase } from './list-accounts-with-balances.use-case';

class InMemoryAccountRepository extends AccountRepository {
  constructor(private readonly accounts: Account[]) {
    super();
  }

  async findAll(): Promise<Account[]> {
    return this.accounts;
  }

  async findById(id: string): Promise<Account | null> {
    return this.accounts.find((account) => account.id === id) ?? null;
  }

  async save(): Promise<void> {
    throw new Error('not implemented');
  }

  async delete(): Promise<void> {
    throw new Error('not implemented');
  }
}

class InMemoryTransactionRepository extends TransactionRepository {
  constructor(private readonly transactions: Transaction[]) {
    super();
  }

  async findAll(): Promise<Transaction[]> {
    return this.transactions;
  }

  async findByAccountId(accountId: string): Promise<Transaction[]> {
    return this.transactions.filter((t) => t.accountId === accountId);
  }

  async findById(id: string): Promise<Transaction | null> {
    return this.transactions.find((t) => t.id === id) ?? null;
  }

  async save(): Promise<void> {
    throw new Error('not implemented');
  }

  async delete(): Promise<void> {
    throw new Error('not implemented');
  }
}

describe('ListAccountsWithBalancesUseCase', () => {
  it('computes the balance of each account from its transactions', async () => {
    const account = Account.create({
      id: 'acc-1',
      userId: 'user-1',
      name: 'Compte Prelevements 1',
      type: AccountType.EXPENSE,
      icon: 'account_balance_wallet',
      monthlyBudget: Money.fromEuros(1500),
    });

    const transactions = [
      Transaction.create({
        id: 'txn-1',
        accountId: 'acc-1',
        label: 'SNCF Voyage',
        category: 'Transport',
        amount: Money.fromEuros(-84.5),
        date: new Date('2025-10-12'),
      }),
      Transaction.create({
        id: 'txn-2',
        accountId: 'acc-1',
        label: 'Monoprix',
        category: 'Alimentation',
        amount: Money.fromEuros(-126.3),
        date: new Date('2025-09-28'),
      }),
    ];

    const useCase = new ListAccountsWithBalancesUseCase(
      new InMemoryAccountRepository([account]),
      new InMemoryTransactionRepository(transactions),
    );

    const [summary] = await useCase.execute('user-1');

    expect(summary.balanceCents).toBe(-21080);
    expect(summary.monthlyBudgetCents).toBe(150000);
  });
});
