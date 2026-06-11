import { Injectable } from '@nestjs/common';
import { AccountRepository } from '../../domain/account/account.repository';
import { TransactionRepository } from '../../domain/transaction/transaction.repository';
import { Money } from '../../domain/shared/money';
import { AccountSummaryDto } from './account-summary.dto';

/**
 * Computes, for every account, its current balance as the sum of its
 * transactions' amounts.
 */
@Injectable()
export class ListAccountsWithBalancesUseCase {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly transactionRepository: TransactionRepository,
  ) {}

  async execute(userId: string): Promise<AccountSummaryDto[]> {
    const accounts = await this.accountRepository.findAll(userId);

    return Promise.all(
      accounts.map(async (account) => {
        const transactions = await this.transactionRepository.findByAccountId(
          account.id,
        );
        const balance = transactions.reduce(
          (total, transaction) => total.add(transaction.amount),
          Money.zero(),
        );

        return {
          id: account.id,
          name: account.name,
          type: account.type,
          icon: account.icon,
          balanceCents: balance.toCents(),
          monthlyBudgetCents: account.monthlyBudget?.toCents() ?? null,
        };
      }),
    );
  }
}
