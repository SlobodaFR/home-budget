import { Injectable, NotFoundException } from '@nestjs/common';
import { AccountRepository } from '../../domain/account/account.repository';
import { Money } from '../../domain/shared/money';
import { RecurringTransaction } from '../../domain/recurring-transaction/recurring-transaction';
import { RecurringTransactionRepository } from '../../domain/recurring-transaction/recurring-transaction.repository';
import { RecurringTransactionInput } from './create-recurring-transaction.use-case';

@Injectable()
export class UpdateRecurringTransactionUseCase {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly recurringTransactionRepository: RecurringTransactionRepository,
  ) {}

  async execute(id: string, input: RecurringTransactionInput, userId: string): Promise<void> {
    const existing = await this.recurringTransactionRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Recurring transaction ${id} not found`);
    }

    const currentAccount = await this.accountRepository.findById(existing.accountId);
    if (!currentAccount || currentAccount.userId !== userId) {
      throw new NotFoundException(`Recurring transaction ${id} not found`);
    }

    const targetAccount = await this.accountRepository.findById(input.accountId);
    if (!targetAccount || targetAccount.userId !== userId) {
      throw new NotFoundException(`Account ${input.accountId} not found`);
    }

    const updated = RecurringTransaction.create({
      id,
      accountId: targetAccount.id,
      label: input.label,
      category: input.category,
      amount: Money.fromCents(input.amountCents),
      dayOfMonth: input.dayOfMonth,
      startDate: input.startDate,
      endDate: input.endDate,
      active: input.active,
    });

    await this.recurringTransactionRepository.save(updated);
  }
}
