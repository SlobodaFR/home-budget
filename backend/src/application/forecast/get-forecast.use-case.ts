import { Injectable } from '@nestjs/common';
import { parseMonth } from '../../domain/budget/month';
import { buildForecast } from '../../domain/budget/forecast';
import { RecurringItemRepository } from '../../domain/recurring/recurring-item.repository';
import { Clock } from '../../domain/shared/clock';
import { SpacePlan } from '../../domain/space/space-plan';
import { SpacePlanRepository } from '../../domain/space/space-plan.repository';
import { TransactionRepository } from '../../domain/transaction/transaction.repository';
import { SpaceAccessService } from '../household/space-access.service';
import { ForecastDto, toForecastDto } from './forecast.dto';

/** Projette la fin du mois d'un espace : opérations réelles + récurrents pas encore retrouvés. */
@Injectable()
export class GetForecastUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly plans: SpacePlanRepository,
    private readonly transactions: TransactionRepository,
    private readonly recurring: RecurringItemRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    month: string,
  ): Promise<ForecastDto> {
    await this.access.requireSpace(userId, spaceId);
    const { from, to } = parseMonth(month);
    const [plan, transactions, recurring] = await Promise.all([
      this.plans.find(spaceId),
      this.transactions.findBySpaceAndPeriod(spaceId, from, to),
      this.recurring.findBySpace(spaceId),
    ]);
    return toForecastDto(
      buildForecast({
        month,
        today: this.clock.now(),
        plan: plan ?? SpacePlan.empty(),
        transactions,
        recurring,
      }),
    );
  }
}
