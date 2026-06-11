import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Account } from '../../domain/account/account';
import { AccountRepository } from '../../domain/account/account.repository';
import { Money } from '../../domain/shared/money';
import { AccountInput } from './account-input.dto';
import { AccountSummaryDto } from './account-summary.dto';

@Injectable()
export class CreateAccountUseCase {
  constructor(private readonly accountRepository: AccountRepository) {}

  async execute(
    input: AccountInput,
    userId: string,
  ): Promise<AccountSummaryDto> {
    let account: Account;
    try {
      account = Account.create({
        id: randomUUID(),
        userId,
        name: input.name,
        type: input.type,
        icon: input.icon,
        monthlyBudget:
          input.monthlyBudgetCents === null
            ? null
            : Money.fromCents(input.monthlyBudgetCents),
      });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid account',
      );
    }

    await this.accountRepository.save(account);

    return {
      id: account.id,
      name: account.name,
      type: account.type,
      icon: account.icon,
      balanceCents: 0,
      monthlyBudgetCents: account.monthlyBudget?.toCents() ?? null,
    };
  }
}
