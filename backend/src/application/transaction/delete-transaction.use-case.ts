import { Injectable, NotFoundException } from '@nestjs/common';
import { AccountRepository } from '../../domain/account/account.repository';
import { TransactionRepository } from '../../domain/transaction/transaction.repository';

@Injectable()
export class DeleteTransactionUseCase {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly transactionRepository: TransactionRepository,
  ) {}

  async execute(id: string, userId: string): Promise<void> {
    const existing = await this.transactionRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Transaction ${id} not found`);
    }

    const account = await this.accountRepository.findById(existing.accountId);
    if (!account || account.userId !== userId) {
      throw new NotFoundException(`Transaction ${id} not found`);
    }

    await this.transactionRepository.delete(id);
  }
}
