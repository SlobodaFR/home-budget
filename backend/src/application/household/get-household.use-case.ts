import { Injectable } from '@nestjs/common';
import { HouseholdRepository } from '../../domain/household/household.repository';
import { HouseholdDto, HouseholdViewBuilder } from './household.dto';

@Injectable()
export class GetHouseholdUseCase {
  constructor(
    private readonly households: HouseholdRepository,
    private readonly view: HouseholdViewBuilder,
  ) {}

  async execute(userId: string): Promise<{ household: HouseholdDto | null }> {
    const snapshot = await this.households.findSnapshotByUserId(userId);
    return {
      household: snapshot ? await this.view.build(snapshot, userId) : null,
    };
  }
}
