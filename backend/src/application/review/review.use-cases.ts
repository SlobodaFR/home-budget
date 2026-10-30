import { Injectable } from '@nestjs/common';
import { AccountRepository } from '../../domain/account/account.repository';
import { buildForecast, monthPhase } from '../../domain/budget/forecast';
import { parseMonth } from '../../domain/budget/month';
import { summarizeMonth } from '../../domain/budget/month-summary';
import { RecurringItemRepository } from '../../domain/recurring/recurring-item.repository';
import {
  MonthReview,
  ReviewAnswers,
  ReviewStatus,
} from '../../domain/review/month-review';
import { MonthReviewRepository } from '../../domain/review/month-review.repository';
import {
  ReviewSnapshot,
  buildReviewSnapshot,
} from '../../domain/review/review-snapshot';
import { Clock } from '../../domain/shared/clock';
import { DomainError } from '../../domain/shared/domain-error';
import { SpacePlan } from '../../domain/space/space-plan';
import { SpacePlanRepository } from '../../domain/space/space-plan.repository';
import { TransactionRepository } from '../../domain/transaction/transaction.repository';
import { SpaceAccessService } from '../household/space-access.service';

export interface ReviewDto {
  month: string;
  status: ReviewStatus;
  answers: ReviewAnswers;
  completedAt: string | null;
  snapshot: ReviewSnapshot;
}

export interface ReviewHistoryItemDto {
  month: string;
  status: ReviewStatus;
  decision: string;
  completedAt: string | null;
}

export const DEFAULT_HISTORY_LIMIT = 12;

/** Un mois qui n'a pas commencé n'a rien à revoir (ni à lire, ni à écrire). */
function assertNotFuture(month: string, now: Date): void {
  if (monthPhase(month, now) === 'FUTURE') {
    throw new DomainError("Ce mois n'a pas encore commencé : rien à revoir");
  }
}

/** Revue d'un mois : réponses sauvegardées + photographie recalculée (jamais stockée). */
@Injectable()
export class GetReviewUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly reviews: MonthReviewRepository,
    private readonly plans: SpacePlanRepository,
    private readonly transactions: TransactionRepository,
    private readonly recurring: RecurringItemRepository,
    private readonly accounts: AccountRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    month: string,
  ): Promise<ReviewDto> {
    const space = await this.access.requireSpace(userId, spaceId);
    const { from, to } = parseMonth(month);
    const today = this.clock.now();
    assertNotFuture(month, today);

    const [review, storedPlan, monthTransactions, recurring, accounts] =
      await Promise.all([
        this.reviews.find(spaceId, month),
        this.plans.find(spaceId),
        this.transactions.findBySpaceAndPeriod(spaceId, from, to),
        this.recurring.findBySpace(spaceId),
        this.accounts.findBySpace(spaceId),
      ]);
    const plan = storedPlan ?? SpacePlan.empty();
    const snapshot = buildReviewSnapshot({
      summary: summarizeMonth(month, plan, monthTransactions),
      forecast: buildForecast({
        month,
        today,
        plan,
        transactions: monthTransactions,
        recurring,
        commonSpace: !space.isPersonal(),
      }),
      transactions: monthTransactions,
      accountCount: accounts.length,
    });
    return {
      month,
      status: review?.status ?? 'TODO',
      answers: review?.answers ?? { wentWell: '', surprise: '', decision: '' },
      completedAt: review?.completedAt?.toISOString() ?? null,
      snapshot,
    };
  }
}

export interface SaveReviewCommand {
  answers: Partial<ReviewAnswers>;
  complete: boolean;
}

@Injectable()
export class SaveReviewUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly reviews: MonthReviewRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    month: string,
    command: SaveReviewCommand,
  ): Promise<void> {
    await this.access.requireSpace(userId, spaceId);
    parseMonth(month);
    const now = this.clock.now();
    assertNotFuture(month, now);
    const existing = await this.reviews.find(spaceId, month);
    const saved = MonthReview.save(
      spaceId,
      month,
      existing,
      {
        wentWell: command.answers.wentWell ?? '',
        surprise: command.answers.surprise ?? '',
        decision: command.answers.decision ?? '',
      },
      command.complete,
      now,
    );
    if (saved) {
      await this.reviews.save(saved);
    } else {
      // Réponses vides et non terminée : la revue retombe à TODO, rien n'est conservé.
      await this.reviews.delete(spaceId, month);
    }
  }
}

/** Historique des revues non TODO, de la plus récente à la plus ancienne. */
@Injectable()
export class ListReviewsUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly reviews: MonthReviewRepository,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    limit: number = DEFAULT_HISTORY_LIMIT,
  ): Promise<ReviewHistoryItemDto[]> {
    await this.access.requireSpace(userId, spaceId);
    return (await this.reviews.findBySpace(spaceId))
      .filter((r) => r.status !== 'TODO')
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, limit)
      .map((r) => ({
        month: r.month,
        status: r.status,
        decision: r.answers.decision,
        completedAt: r.completedAt?.toISOString() ?? null,
      }));
  }
}
