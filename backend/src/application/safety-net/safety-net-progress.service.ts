import { Injectable } from '@nestjs/common';
import {
  SafetyNetProgress,
  REFERENCE_AVERAGE_MONTHS,
  buildSafetyNetProgress,
  currentSafetyNetCents,
  essentialSpendCents,
  referenceMonthlySpendCents,
} from '../../domain/safety-net/safety-net-coverage';
import { SafetyNet } from '../../domain/safety-net/safety-net';
import { addDays, parseIsoDate } from '../../domain/shared/calendar';
import { Clock } from '../../domain/shared/clock';
import { SpacePlan } from '../../domain/space/space-plan';
import { SpacePlanRepository } from '../../domain/space/space-plan.repository';
import { TransactionRepository } from '../../domain/transaction/transaction.repository';

/**
 * Calcul UNIQUE de la progression de l'épargne de sécurité, partagé par
 * `GET /household/safety-net` et par le conseil `safety-net-progress`.
 */
@Injectable()
export class SafetyNetProgressService {
  constructor(
    private readonly plans: SpacePlanRepository,
    private readonly transactions: TransactionRepository,
    private readonly clock: Clock,
  ) {}

  async compute(
    commonSpaceId: string,
    safetyNet: SafetyNet,
  ): Promise<SafetyNetProgress> {
    const now = this.clock.now();
    const currentMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const averageFrom = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - REFERENCE_AVERAGE_MONTHS,
        1,
      ),
    );
    const [plan, after] = await Promise.all([
      this.plans.find(commonSpaceId),
      this.transactions.findBySpaceFrom(
        commonSpaceId,
        addDays(parseIsoDate(safetyNet.asOf), 1),
      ),
    ]);
    const effectivePlan = plan ?? SpacePlan.empty();
    // Le réel n'est lu que si le plan ne donne aucune base.
    const recent =
      effectivePlan.fixeCents + effectivePlan.courantCents > 0
        ? []
        : await this.transactions.findBySpaceAndPeriod(
            commonSpaceId,
            averageFrom,
            currentMonthStart,
          );
    return buildSafetyNetProgress(
      currentSafetyNetCents(safetyNet, after),
      referenceMonthlySpendCents(effectivePlan, essentialSpendCents(recent)),
    );
  }
}
