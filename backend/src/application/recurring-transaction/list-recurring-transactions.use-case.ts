import { Injectable } from '@nestjs/common';
import { RecurringTransactionRepository } from '../../domain/recurring-transaction/recurring-transaction.repository';
import { RecurringTransactionDto } from './recurring-transaction.dto';
import { toRecurringTransactionDto } from './recurring-transaction.mapper';

@Injectable()
export class ListRecurringTransactionsUseCase {
  constructor(
    private readonly recurringTransactionRepository: RecurringTransactionRepository,
  ) {}

  async execute(userId: string): Promise<RecurringTransactionDto[]> {
    const recurringTransactions =
      await this.recurringTransactionRepository.findAll(userId);
    return recurringTransactions.map(toRecurringTransactionDto);
  }
}
