import { Injectable, NotFoundException } from '@nestjs/common';
import { AccountRepository } from '../../domain/account/account.repository';
import { RecurringTransactionRepository } from '../../domain/recurring-transaction/recurring-transaction.repository';

@Injectable()
export class DeleteRecurringTransactionUseCase {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly recurringTransactionRepository: RecurringTransactionRepository,
  ) {}

  async execute(id: string, userId: string): Promise<void> {
    const existing = await this.recurringTransactionRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Recurring transaction ${id} not found`);
    }

    const account = await this.accountRepository.findById(existing.accountId);
    if (!account || account.userId !== userId) {
      throw new NotFoundException(`Recurring transaction ${id} not found`);
    }

    await this.recurringTransactionRepository.delete(id);
  }
}
