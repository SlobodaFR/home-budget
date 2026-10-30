import { Injectable } from '@nestjs/common';
import { ContributionMode } from '../../domain/household/household';
import { HouseholdRepository } from '../../domain/household/household.repository';
import { SpaceAccessService } from './space-access.service';

@Injectable()
export class SetMyIncomeUseCase {
  constructor(
    private readonly households: HouseholdRepository,
    private readonly access: SpaceAccessService,
  ) {}

  async execute(
    userId: string,
    netMonthlyIncomeCents: number | null,
  ): Promise<void> {
    const snapshot = await this.access.requireSnapshot(userId);
    const membership = snapshot.memberships.find((m) => m.userId === userId)!;
    await this.households.saveMembership(
      membership.withIncome(netMonthlyIncomeCents),
    );
  }
}

@Injectable()
export class SetContributionModeUseCase {
  constructor(
    private readonly households: HouseholdRepository,
    private readonly access: SpaceAccessService,
  ) {}

  async execute(userId: string, mode: ContributionMode): Promise<void> {
    const snapshot = await this.access.requireSnapshot(userId);
    await this.households.saveHousehold(
      snapshot.household.withContributionMode(mode),
    );
  }
}
