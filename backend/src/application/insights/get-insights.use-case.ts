import { Injectable } from '@nestjs/common';
import { buildForecast } from '../../domain/budget/forecast';
import {
  CommonInsightsContext,
  Insight,
  REVIEW_LAST_DAY,
  buildInsights,
} from '../../domain/budget/insights';
import { buildProvisions } from '../../domain/budget/provisions';
import { parseMonth } from '../../domain/budget/month';
import { summarizeMonth } from '../../domain/budget/month-summary';
import { RecurringItemRepository } from '../../domain/recurring/recurring-item.repository';
import { SafetyNetRepository } from '../../domain/safety-net/safety-net.repository';
import { Clock } from '../../domain/shared/clock';
import { SpacePlan } from '../../domain/space/space-plan';
import { SpacePlanRepository } from '../../domain/space/space-plan.repository';
import { TransactionRepository } from '../../domain/transaction/transaction.repository';
import { SpaceAccessService } from '../household/space-access.service';
import { MonthReviewRepository } from '../../domain/review/month-review.repository';
import { currentMonth } from '../../domain/budget/month';
import { previousMonth } from '../../domain/shared/format';
import { summarizeDebts, isActiveDebt } from '../../domain/debt/debt-view';
import { DebtViewsService } from '../debt/debt-views.service';
import { ProjectViewsService } from '../project/project-views.service';
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
    private readonly projectViews: ProjectViewsService,
    private readonly reviews: MonthReviewRepository,
    private readonly debtViews: DebtViewsService,
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

    const [views, projects] = await Promise.all([
      this.accountViews.forSpace(spaceId),
      this.projectViews.forSpace(spaceId),
    ]);

    const [debts, monthlyIncome] = await Promise.all([
      this.debtViews.forSpace(spaceId),
      this.debtViews.monthlyIncomeCents(userId, space),
    ]);

    // Revue du mois précédent : utile seulement la première semaine du mois.
    const previousReview =
      today.getUTCDate() <= REVIEW_LAST_DAY
        ? await this.reviews.find(spaceId, previousMonth(currentMonth(today)))
        : null;

    return {
      insights: buildInsights({
        month,
        today,
        plan,
        summary,
        forecast,
        lastActivity,
        common,
        provisions: buildProvisions(recurring, today),
        projects,
        debts: {
          summary: summarizeDebts(debts, monthlyIncome),
          monthlyIncomeCents: monthlyIncome,
          neverPaidOff: debts
            .filter((v) => isActiveDebt(v) && v.neverPaidOff)
            .map((v) => ({
              name: v.debt.name,
              monthlyPaymentCents: v.debt.monthlyPaymentCents,
              nextMonthInterestCents: v.nextMonthInterestCents,
            })),
        },
        previousReview: previousReview
          ? {
              status: previousReview.status,
              decision: previousReview.answers.decision,
            }
          : null,
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
