import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AccountRepository } from '../../domain/account/account.repository';
import { Money } from '../../domain/shared/money';
import { RecurringTransaction } from '../../domain/recurring-transaction/recurring-transaction';
import { RecurringTransactionRepository } from '../../domain/recurring-transaction/recurring-transaction.repository';
import { TransactionCategory } from '../../domain/transaction/transaction-category';
import { RecurringTransactionDto } from './recurring-transaction.dto';
import { toRecurringTransactionDto } from './recurring-transaction.mapper';

export interface RecurringTransactionInput {
  accountId: string;
  label: string;
  category: TransactionCategory;
  amountCents: number;
  dayOfMonth: number | null;
  startDate: Date;
  endDate: Date | null;
  active: boolean;
}

@Injectable()
export class CreateRecurringTransactionUseCase {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly recurringTransactionRepository: RecurringTransactionRepository,
  ) {}

  async execute(input: RecurringTransactionInput, userId: string): Promise<RecurringTransactionDto> {
    const account = await this.accountRepository.findById(input.accountId);
    if (!account || account.userId !== userId) {
      throw new NotFoundException(`Account ${input.accountId} not found`);
    }

    const recurringTransaction = RecurringTransaction.create({
      id: randomUUID(),
      accountId: account.id,
      label: input.label,
      category: input.category,
      amount: Money.fromCents(input.amountCents),
      dayOfMonth: input.dayOfMonth,
      startDate: input.startDate,
      endDate: input.endDate,
      active: input.active,
    });

    await this.recurringTransactionRepository.save(recurringTransaction);

    return toRecurringTransactionDto(recurringTransaction);
  }
}
