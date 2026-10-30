import { Injectable } from '@nestjs/common';
import { ContributionMode } from '../../domain/household/household';
import { computeContributions } from '../../domain/contribution/contribution';
import { SpacePlan } from '../../domain/space/space-plan';
import { SpacePlanRepository } from '../../domain/space/space-plan.repository';
import { UserRepository } from '../../domain/user/user.repository';
import { SpaceAccessService } from '../household/space-access.service';

export interface ContributionDto {
  mode: ContributionMode;
  commonNeedCents: number;
  /** Vrai si un revenu manque : les parts sont alors a zero et a ne pas afficher. */
  incomplete: boolean;
  shortfallCents: number;
  shares: {
    userId: string;
    name: string;
    incomeCents: number;
    contributionCents: number;
    remainingCents: number;
  }[];
}

/** Part de chacun dans le budget de l'espace commun, selon la regle du foyer. */
@Injectable()
export class GetContributionUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly plans: SpacePlanRepository,
    private readonly users: UserRepository,
  ) {}

  async execute(userId: string): Promise<ContributionDto> {
    const snapshot = await this.access.requireSnapshot(userId);
    const common = snapshot.spaces.find((s) => s.kind === 'COMMON');
    const plan = common
      ? ((await this.plans.find(common.id)) ?? SpacePlan.empty())
      : SpacePlan.empty();
    const commonNeedCents = plan.totalBlocsCents;
    const mode = snapshot.household.contributionMode;

    const incomplete = snapshot.memberships.some(
      (m) => m.netMonthlyIncomeCents === null,
    );
    const names = new Map<string, string>();
    for (const membership of snapshot.memberships) {
      names.set(
        membership.userId,
        (await this.users.findById(membership.userId))?.name ?? 'Membre',
      );
    }

    if (incomplete) {
      return {
        mode,
        commonNeedCents,
        incomplete: true,
        shortfallCents: 0,
        shares: snapshot.memberships.map((m) => ({
          userId: m.userId,
          name: names.get(m.userId)!,
          incomeCents: m.netMonthlyIncomeCents ?? 0,
          contributionCents: 0,
          remainingCents: 0,
        })),
      };
    }

    const result = computeContributions(
      mode,
      commonNeedCents,
      snapshot.memberships.map((m) => ({
        userId: m.userId,
        incomeCents: m.netMonthlyIncomeCents ?? 0,
      })),
    );

    return {
      mode,
      commonNeedCents,
      incomplete: false,
      shortfallCents: result.shortfallCents,
      shares: result.shares.map((share) => {
        const income = snapshot.memberships.find(
          (m) => m.userId === share.userId,
        )!.netMonthlyIncomeCents!;
        return {
          userId: share.userId,
          name: names.get(share.userId)!,
          incomeCents: income,
          contributionCents: share.contributionCents,
          remainingCents: income - share.contributionCents,
        };
      }),
    };
  }
}
