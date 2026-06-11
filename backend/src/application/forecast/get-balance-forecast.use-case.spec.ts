import { Account } from '../../domain/account/account';
import { AccountRepository } from '../../domain/account/account.repository';
import { AccountType } from '../../domain/account/account-type.enum';
import { Money } from '../../domain/shared/money';
import { RecurringTransaction } from '../../domain/recurring-transaction/recurring-transaction';
import { RecurringTransactionRepository } from '../../domain/recurring-transaction/recurring-transaction.repository';
import { Transaction } from '../../domain/transaction/transaction';
import { TransactionRepository } from '../../domain/transaction/transaction.repository';
import { GetBalanceForecastUseCase } from './get-balance-forecast.use-case';

class InMemoryAccountRepository extends AccountRepository {
  constructor(private readonly accounts: Account[]) {
    super();
  }

  async findAll(): Promise<Account[]> {
    return this.accounts;
  }

  async findById(id: string): Promise<Account | null> {
    return this.accounts.find((a) => a.id === id) ?? null;
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

class InMemoryRecurringTransactionRepository extends RecurringTransactionRepository {
  constructor(private readonly recurringTransactions: RecurringTransaction[]) {
    super();
  }

  async findAll(): Promise<RecurringTransaction[]> {
    return this.recurringTransactions;
  }

  async findById(id: string): Promise<RecurringTransaction | null> {
    return this.recurringTransactions.find((rt) => rt.id === id) ?? null;
  }

  async save(): Promise<void> {
    throw new Error('not implemented');
  }

  async delete(): Promise<void> {
    throw new Error('not implemented');
  }
}

describe('GetBalanceForecastUseCase', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-01T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('projects the balance with recurring occurrences up to the target date', async () => {
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
        label: 'Loyer mai',
        category: 'Logement',
        amount: Money.fromEuros(-800),
        date: new Date('2026-05-05'),
      }),
    ];

    const recurringTransactions = [
      RecurringTransaction.create({
        id: 'rt-1',
        accountId: 'acc-1',
        label: 'Loyer',
        category: 'Logement',
        amount: Money.fromEuros(-800),
        dayOfMonth: 5,
        startDate: new Date('2026-01-01'),
        endDate: null,
        active: true,
      }),
      RecurringTransaction.create({
        id: 'rt-2',
        accountId: 'acc-1',
        label: 'Remboursement secu',
        category: 'Sante',
        amount: Money.fromEuros(40),
        dayOfMonth: null,
        startDate: new Date('2026-01-01'),
        endDate: null,
        active: true,
      }),
    ];

    const useCase = new GetBalanceForecastUseCase(
      new InMemoryAccountRepository([account]),
      new InMemoryTransactionRepository(transactions),
      new InMemoryRecurringTransactionRepository(recurringTransactions),
    );

    const result = await useCase.execute(
      'user-1',
      new Date('2026-07-31T00:00:00Z'),
    );

    const [accountForecast] = result.accounts;
    expect(accountForecast.currentBalanceCents).toBe(-80000);
    // -800 (current) + 2x rent (-1600) + 2x reimbursement estimate (+80)
    expect(accountForecast.projectedBalanceCents).toBe(-80000 + -160000 + 8000);
    expect(result.upcomingOccurrences).toHaveLength(4);
    expect(result.upcomingOccurrences[0]).toMatchObject({
      label: 'Loyer',
      date: '2026-06-05T00:00:00.000Z',
      estimated: false,
    });
    expect(
      result.upcomingOccurrences.find((o) => o.label === 'Remboursement secu'),
    ).toMatchObject({
      estimated: true,
    });
  });

  it('returns the current balance unchanged when the target date is today', async () => {
    const account = Account.create({
      id: 'acc-1',
      userId: 'user-1',
      name: 'Compte Source',
      type: AccountType.SOURCE,
      icon: 'savings',
      monthlyBudget: null,
    });

    const useCase = new GetBalanceForecastUseCase(
      new InMemoryAccountRepository([account]),
      new InMemoryTransactionRepository([]),
      new InMemoryRecurringTransactionRepository([]),
    );

    const result = await useCase.execute(
      'user-1',
      new Date('2026-06-01T00:00:00Z'),
    );

    expect(result.accounts[0].currentBalanceCents).toBe(0);
    expect(result.accounts[0].projectedBalanceCents).toBe(0);
    expect(result.upcomingOccurrences).toEqual([]);
  });
});
