import { Injectable } from '@nestjs/common';
import { buildForecast } from '../../domain/budget/forecast';
import {
  CommonInsightsContext,
  Insight,
  buildInsights,
} from '../../domain/budget/insights';
import { parseMonth } from '../../domain/budget/month';
import { summarizeMonth } from '../../domain/budget/month-summary';
import { RecurringItemRepository } from '../../domain/recurring/recurring-item.repository';
import { SafetyNetRepository } from '../../domain/safety-net/safety-net.repository';
import { Clock } from '../../domain/shared/clock';
import { SpacePlan } from '../../domain/space/space-plan';
import { SpacePlanRepository } from '../../domain/space/space-plan.repository';
import { TransactionRepository } from '../../domain/transaction/transaction.repository';
import { SpaceAccessService } from '../household/space-access.service';
import { AccountViewsService } from '../account/account-views.service';
import { SafetyNetProgressService } from '../safety-net/safety-net-progress.service';

/** Prochaines actions : conseils déterministes issus des règles du cours (aucun conseil de placement). */
@Injectable()
export class GetInsightsUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly plans: SpacePlanRepository,
    private readonly transactions: TransactionRepository,
    private readonly recurring: RecurringItemRepository,
    private readonly safetyNets: SafetyNetRepository,
    private readonly safetyNetProgress: SafetyNetProgressService,
    private readonly accountViews: AccountViewsService,
    private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    month: string,
  ): Promise<{ insights: Insight[] }> {
    const space = await this.access.requireSpace(userId, spaceId);
    const { from, to } = parseMonth(month);
    const today = this.clock.now();
    const [storedPlan, monthTransactions, recurring, lastActivity] =
      await Promise.all([
        this.plans.find(spaceId),
        this.transactions.findBySpaceAndPeriod(spaceId, from, to),
        this.recurring.findBySpace(spaceId),
        this.transactions.findLatestDate(spaceId),
      ]);
    const plan = storedPlan ?? SpacePlan.empty();
    const summary = summarizeMonth(month, plan, monthTransactions);
    const forecast = buildForecast({
      month,
      today,
      plan,
      transactions: monthTransactions,
      recurring,
      commonSpace: !space.isPersonal(),
    });

    let common: CommonInsightsContext | null = null;
    if (!space.isPersonal()) {
      const snapshot = await this.access.requireSnapshot(userId);
      const stored = await this.safetyNets.find(snapshot.household.id);
      common = {
        safetyNet: null,
        contributionIncomplete: snapshot.memberships.some(
          (m) => m.netMonthlyIncomeCents === null,
        ),
      };
      if (stored) {
        // Même calcul que GET /household/safety-net : une seule base de référence.
        const progress = await this.safetyNetProgress.compute(spaceId, stored);
        common.safetyNet = { ...progress, targetMonths: stored.targetMonths };
      }
    }

    const views = await this.accountViews.forSpace(spaceId);

    return {
      insights: buildInsights({
        month,
        today,
        plan,
        summary,
        forecast,
        lastActivity,
        common,
        accounts: {
          accountCount: views.length,
          negativeProjected: views
            .filter((v) => !v.account.archived && v.projectedMonthEndCents < 0)
            .map((v) => ({
              name: v.account.name,
              projectedMonthEndCents: v.projectedMonthEndCents,
            })),
          unassignedTransactionCount: monthTransactions.filter(
            (t) => t.accountId === null,
          ).length,
        },
      }),
    };
  }
}
