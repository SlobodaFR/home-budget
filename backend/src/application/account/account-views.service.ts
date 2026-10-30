import { Injectable } from '@nestjs/common';
import { AccountRepository } from '../../domain/account/account.repository';
import {
  AccountView,
  buildAccountViews,
} from '../../domain/account/account-balance';
import {
  expandOccurrences,
  matchOccurrences,
} from '../../domain/budget/forecast';
import { currentMonth, parseMonth } from '../../domain/budget/month';
import { RecurringItemRepository } from '../../domain/recurring/recurring-item.repository';
import { Clock } from '../../domain/shared/clock';
import { TransactionRepository } from '../../domain/transaction/transaction.repository';

/**
 * Soldes et projections des comptes d'un espace. Le moteur du prévisionnel
 * fournit les occurrences récurrentes du mois courant (appariées aux opérations
 * du mois) : celles encore DUE ou MISSING pèsent sur la projection de fin de mois.
 */
@Injectable()
export class AccountViewsService {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly transactions: TransactionRepository,
    private readonly recurring: RecurringItemRepository,
    private readonly clock: Clock,
  ) {}

  async forSpace(spaceId: string): Promise<AccountView[]> {
    const accounts = await this.accounts.findBySpace(spaceId);
    if (accounts.length === 0) {
      return [];
    }
    const now = this.clock.now();
    const month = currentMonth(now);
    const { from, to } = parseMonth(month);
    const [attached, monthTransactions, items] = await Promise.all([
      this.transactions.findAttachedBySpace(spaceId),
      this.transactions.findBySpaceAndPeriod(spaceId, from, to),
      this.recurring.findBySpace(spaceId),
    ]);
    const occurrences = matchOccurrences(
      expandOccurrences(items, month),
      monthTransactions,
      now,
    );
    return buildAccountViews(accounts, attached, occurrences);
  }
}
