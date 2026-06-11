import { Injectable, NotFoundException } from '@nestjs/common';
import { AccountRepository } from '../../domain/account/account.repository';
import { Money } from '../../domain/shared/money';
import { Transaction } from '../../domain/transaction/transaction';
import { TransactionCategory } from '../../domain/transaction/transaction-category';
import { TransactionRepository } from '../../domain/transaction/transaction.repository';

export interface UpdateTransactionCommand {
  accountId: string;
  label: string;
  category: TransactionCategory;
  amountCents: number;
  date?: Date;
}

@Injectable()
export class UpdateTransactionUseCase {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly transactionRepository: TransactionRepository,
  ) {}

  async execute(
    id: string,
    command: UpdateTransactionCommand,
    userId: string,
  ): Promise<void> {
    const existing = await this.transactionRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Transaction ${id} not found`);
    }

    const existingAccount = await this.accountRepository.findById(
      existing.accountId,
    );
    if (!existingAccount || existingAccount.userId !== userId) {
      throw new NotFoundException(`Transaction ${id} not found`);
    }

    const account = await this.accountRepository.findById(command.accountId);
    if (!account || account.userId !== userId) {
      throw new NotFoundException(`Account ${command.accountId} not found`);
    }

    const transaction = Transaction.create({
      id,
      accountId: account.id,
      label: command.label,
      category: command.category,
      amount: Money.fromCents(command.amountCents),
      date: command.date ?? existing.date,
    });

    await this.transactionRepository.save(transaction);
  }
}
