import { Injectable } from '@nestjs/common';
import { TransactionRepository } from '../../domain/transaction/transaction.repository';
import { TransactionDto } from './transaction.dto';

const DEFAULT_LIMIT = 10;

@Injectable()
export class ListRecentTransactionsUseCase {
  constructor(private readonly transactionRepository: TransactionRepository) {}

  async execute(
    userId: string,
    limit: number = DEFAULT_LIMIT,
  ): Promise<TransactionDto[]> {
    const transactions = await this.transactionRepository.findAll(
      limit,
      userId,
    );

    return transactions.map((transaction) => ({
      id: transaction.id,
      accountId: transaction.accountId,
      label: transaction.label,
      category: transaction.category,
      amountCents: transaction.amount.toCents(),
      date: transaction.date.toISOString(),
    }));
  }
}
