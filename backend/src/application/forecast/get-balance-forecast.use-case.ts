import { Injectable } from '@nestjs/common';
import { AccountRepository } from '../../domain/account/account.repository';
import { Money } from '../../domain/shared/money';
import { RecurringTransactionRepository } from '../../domain/recurring-transaction/recurring-transaction.repository';
import { TransactionRepository } from '../../domain/transaction/transaction.repository';
import {
  BalanceForecastDto,
  UpcomingOccurrenceDto,
} from './balance-forecast.dto';

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Projects, for every account, the balance expected on a given target date by
 * adding the amounts of recurring transaction occurrences due between today
 * and that date to the current (recorded) balance.
 */
@Injectable()
export class GetBalanceForecastUseCase {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly transactionRepository: TransactionRepository,
    private readonly recurringTransactionRepository: RecurringTransactionRepository,
  ) {}

  async execute(userId: string, targetDate: Date): Promise<BalanceForecastDto> {
    const today = startOfTodayUtc();
    const accounts = await this.accountRepository.findAll(userId);
    const recurringTransactions =
      await this.recurringTransactionRepository.findAll(userId);

    const upcomingOccurrences: UpcomingOccurrenceDto[] = [];

    const accountForecasts = await Promise.all(
      accounts.map(async (account) => {
        const transactions = await this.transactionRepository.findByAccountId(
          account.id,
        );
        const currentBalance = transactions.reduce(
          (total, transaction) => total.add(transaction.amount),
          Money.zero(),
        );

        const accountRecurring = recurringTransactions.filter(
          (rt) => rt.accountId === account.id,
        );

        let projectedBalance = currentBalance;
        for (const rt of accountRecurring) {
          for (const date of rt.occurrencesBetween(today, targetDate)) {
            projectedBalance = projectedBalance.add(rt.amount);
            upcomingOccurrences.push({
              recurringTransactionId: rt.id,
              accountId: account.id,
              label: rt.label,
              category: rt.category,
              amountCents: rt.amount.toCents(),
              date: date.toISOString(),
              estimated: rt.dayOfMonth === null,
            });
          }
        }

        return {
          id: account.id,
          name: account.name,
          type: account.type,
          icon: account.icon,
          currentBalanceCents: currentBalance.toCents(),
          projectedBalanceCents: projectedBalance.toCents(),
        };
      }),
    );

    upcomingOccurrences.sort((a, b) => a.date.localeCompare(b.date));

    const totalCurrentBalanceCents = accountForecasts.reduce(
      (sum, a) => sum + a.currentBalanceCents,
      0,
    );
    const totalProjectedBalanceCents = accountForecasts.reduce(
      (sum, a) => sum + a.projectedBalanceCents,
      0,
    );

    return {
      asOfDate: today.toISOString(),
      targetDate: targetDate.toISOString(),
      accounts: accountForecasts,
      totalCurrentBalanceCents,
      totalProjectedBalanceCents,
      upcomingOccurrences,
    };
  }
}
