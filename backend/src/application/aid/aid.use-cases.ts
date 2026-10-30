import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AidLineInput,
  AidRuleResult,
  computeAidRule,
} from '../../domain/aid/aid-estimate';
import { AID_RULES, AidRule } from '../../domain/aid/aid-rules';
import {
  CrecheEstimate,
  CrecheEstimateInput,
  estimateCreche,
} from '../../domain/aid/creche-estimate';
import {
  FiscalProfile,
  FiscalProfileProps,
} from '../../domain/aid/fiscal-profile';
import { FiscalProfileRepository } from '../../domain/aid/fiscal-profile.repository';
import {
  expandOccurrences,
  matchOccurrences,
} from '../../domain/budget/forecast';
import { RecurringItemRepository } from '../../domain/recurring/recurring-item.repository';
import { Clock } from '../../domain/shared/clock';
import { Transaction } from '../../domain/transaction/transaction';
import { TransactionRepository } from '../../domain/transaction/transaction.repository';
import { SpaceAccessService } from '../household/space-access.service';

@Injectable()
export class GetFiscalProfileUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly profiles: FiscalProfileRepository,
  ) {}

  async execute(
    userId: string,
  ): Promise<{ fiscalProfile: FiscalProfileProps | null }> {
    const snapshot = await this.access.requireSnapshot(userId);
    const profile = await this.profiles.find(snapshot.household.id);
    return { fiscalProfile: profile ? profile.toProps() : null };
  }
}

@Injectable()
export class SaveFiscalProfileUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly profiles: FiscalProfileRepository,
  ) {}

  async execute(userId: string, props: FiscalProfileProps): Promise<void> {
    const snapshot = await this.access.requireSnapshot(userId);
    await this.profiles.save(
      snapshot.household.id,
      FiscalProfile.create(props),
    );
  }
}

export interface AidsDto {
  year: number;
  profileMissing: boolean;
  rules: AidRuleResult[];
  totalExpectedCreditCents: number;
}

/**
 * Crédits d'impôt attendus pour une année, à partir des lignes récurrentes de
 * l'espace commun rattachées à une règle. Même moteur que le prévisionnel : une
 * occurrence retrouvée dans les opérations compte pour son montant réel, sinon
 * pour le montant du gabarit.
 */
@Injectable()
export class GetAidsUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly recurring: RecurringItemRepository,
    private readonly transactions: TransactionRepository,
    private readonly profiles: FiscalProfileRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    year?: number,
  ): Promise<AidsDto> {
    const space = await this.access.requireSpace(userId, spaceId);
    if (space.isPersonal()) {
      // Les aides reposent sur les plafonds du foyer : elles n'existent que dans l'espace commun.
      throw new NotFoundException('Espace introuvable');
    }
    const today = this.clock.now();
    const targetYear = year ?? today.getUTCFullYear();

    const [items, yearTransactions, stored] = await Promise.all([
      this.recurring.findBySpace(spaceId),
      this.transactions.findBySpaceAndPeriod(
        spaceId,
        new Date(Date.UTC(targetYear, 0, 1)),
        new Date(Date.UTC(targetYear + 1, 0, 1)),
      ),
      this.profiles.find(space.householdId),
    ]);
    const profile = stored ?? FiscalProfile.none();

    // yearly[recurringId] = dépensé sur l'année
    const yearly = new Map<string, number>();
    const attached = items.filter((i) => i.active && i.aidRuleId !== null);
    if (attached.length > 0) {
      for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
        const month = `${targetYear}-${String(monthIndex + 1).padStart(2, '0')}`;
        const monthTransactions = yearTransactions.filter(
          (t: Transaction) => t.date.getUTCMonth() === monthIndex,
        );
        // Tous les gabarits actifs participent à l'appariement, comme dans le prévisionnel.
        const occurrences = matchOccurrences(
          expandOccurrences(items, month),
          monthTransactions,
          today,
        );
        for (const occurrence of occurrences) {
          yearly.set(
            occurrence.recurringId,
            (yearly.get(occurrence.recurringId) ?? 0) +
              (occurrence.matchedAmountCents ?? occurrence.amountCents),
          );
        }
      }
    }

    const rules: AidRuleResult[] = [];
    for (const rule of AID_RULES) {
      const lines: AidLineInput[] = attached
        .filter((i) => i.aidRuleId === rule.id && yearly.has(i.id))
        .sort(
          (a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id),
        )
        .map((i) => ({
          recurringId: i.id,
          label: i.label,
          monthlyCents: i.amount.toCents(),
          yearlySpentCents: yearly.get(i.id)!,
        }));
      if (lines.length > 0) {
        rules.push(computeAidRule(rule.id, lines, profile));
      }
    }

    return {
      year: targetYear,
      profileMissing: stored === null,
      rules,
      totalExpectedCreditCents: rules.reduce(
        (sum, r) => sum + r.expectedCreditCents,
        0,
      ),
    };
  }
}

/** Catalogue des règles : identique pour tous les utilisateurs authentifiés. */
@Injectable()
export class ListAidRulesUseCase {
  execute(): readonly AidRule[] {
    return AID_RULES;
  }
}

@Injectable()
export class EstimateCrecheUseCase {
  execute(input: CrecheEstimateInput): CrecheEstimate {
    return estimateCreche(input);
  }
}
