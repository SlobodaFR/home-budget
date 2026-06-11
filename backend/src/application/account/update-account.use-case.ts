import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Account } from '../../domain/account/account';
import { AccountRepository } from '../../domain/account/account.repository';
import { Money } from '../../domain/shared/money';
import { AccountInput } from './account-input.dto';

@Injectable()
export class UpdateAccountUseCase {
  constructor(private readonly accountRepository: AccountRepository) {}

  async execute(id: string, input: AccountInput, userId: string): Promise<void> {
    const existing = await this.accountRepository.findById(id);
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException(`Account ${id} not found`);
    }

    let account: Account;
    try {
      account = Account.create({
        id,
        userId,
        name: input.name,
        type: input.type,
        icon: input.icon,
        monthlyBudget: input.monthlyBudgetCents === null ? null : Money.fromCents(input.monthlyBudgetCents),
      });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid account');
    }

    await this.accountRepository.save(account);
  }
}
