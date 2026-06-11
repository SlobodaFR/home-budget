import { Injectable } from '@nestjs/common';
import { Money } from '../../domain/shared/money';
import { ListAccountsWithBalancesUseCase } from './list-accounts-with-balances.use-case';

export interface EquitySummaryDto {
  totalBalanceCents: number;
}

/**
 * Total equity is the sum of the balances of every account (source and
 * expense alike): it is "what the household owns right now".
 */
@Injectable()
export class GetEquitySummaryUseCase {
  constructor(
    private readonly listAccountsWithBalances: ListAccountsWithBalancesUseCase,
  ) {}

  async execute(userId: string): Promise<EquitySummaryDto> {
    const accounts = await this.listAccountsWithBalances.execute(userId);
    const total = accounts.reduce(
      (sum, account) => sum.add(Money.fromCents(account.balanceCents)),
      Money.zero(),
    );

    return { totalBalanceCents: total.toCents() };
  }
}
