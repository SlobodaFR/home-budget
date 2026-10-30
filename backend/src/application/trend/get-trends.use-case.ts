import { Injectable } from '@nestjs/common';
import { currentMonth, parseMonth } from '../../domain/budget/month';
import { Clock } from '../../domain/shared/clock';
import { TransactionRepository } from '../../domain/transaction/transaction.repository';
import {
  DEFAULT_TREND_MONTHS,
  Trends,
  assertValidWindow,
  buildTrends,
  shiftMonth,
} from '../../domain/trend/trends';
import { SpaceAccessService } from '../household/space-access.service';

/**
 * Tendances d'un espace sur une fenêtre de mois : lecture seule, calculée à la
 * demande avec UNE requête bornée à la fenêtre (jamais une par mois).
 */
@Injectable()
export class GetTrendsUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly transactions: TransactionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    months: number = DEFAULT_TREND_MONTHS,
    to?: string,
  ): Promise<Trends> {
    await this.access.requireSpace(userId, spaceId);
    const toMonth = to ?? currentMonth(this.clock.now());
    const { to: windowEnd } = parseMonth(toMonth);
    assertValidWindow(toMonth, months);
    const { from } = parseMonth(shiftMonth(toMonth, -(months - 1)));
    const transactions = await this.transactions.findBySpaceAndPeriod(
      spaceId,
      from,
      windowEnd,
    );
    return buildTrends(toMonth, months, transactions);
  }
}
