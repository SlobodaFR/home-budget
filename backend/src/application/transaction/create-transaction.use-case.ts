import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AccountRepository } from '../../domain/account/account.repository';
import { TransactionRepository } from '../../domain/transaction/transaction.repository';
import { Money } from '../../domain/shared/money';
import { Transaction } from '../../domain/transaction/transaction';
import { TransactionCategory } from '../../domain/transaction/transaction-category';
import { TransactionDto } from './transaction.dto';

export interface CreateTransactionCommand {
  accountId: string;
  label: string;
  category: TransactionCategory;
  amountCents: number;
  date?: Date;
}

@Injectable()
export class CreateTransactionUseCase {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly transactionRepository: TransactionRepository,
  ) {}

  async execute(
    command: CreateTransactionCommand,
    userId: string,
  ): Promise<TransactionDto> {
    const account = await this.accountRepository.findById(command.accountId);
    if (!account || account.userId !== userId) {
      throw new NotFoundException(`Account ${command.accountId} not found`);
    }

    const transaction = Transaction.create({
      id: randomUUID(),
      accountId: account.id,
      label: command.label,
      category: command.category,
      amount: Money.fromCents(command.amountCents),
      date: command.date ?? new Date(),
    });

    await this.transactionRepository.save(transaction);

    return {
      id: transaction.id,
      accountId: transaction.accountId,
      label: transaction.label,
      category: transaction.category,
      amountCents: transaction.amount.toCents(),
      date: transaction.date.toISOString(),
    };
  }
}
