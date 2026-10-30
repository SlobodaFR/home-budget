import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Household } from '../../domain/household/household';
import { HouseholdRepository } from '../../domain/household/household.repository';
import { Membership } from '../../domain/household/membership';
import { Space } from '../../domain/space/space';
import { HouseholdDto, HouseholdViewBuilder } from './household.dto';

export interface CreateHouseholdCommand {
  name: string;
  netMonthlyIncomeCents?: number | null;
}

@Injectable()
export class CreateHouseholdUseCase {
  constructor(
    private readonly households: HouseholdRepository,
    private readonly view: HouseholdViewBuilder,
  ) {}

  async execute(
    userId: string,
    command: CreateHouseholdCommand,
  ): Promise<HouseholdDto> {
    if (await this.households.findSnapshotByUserId(userId)) {
      throw new ConflictException('Vous avez deja un foyer');
    }

    const now = new Date();
    const household = Household.create({
      id: randomUUID(),
      name: command.name,
      contributionMode: 'PROPORTIONAL',
      createdAt: now,
    });
    const membership = Membership.create({
      householdId: household.id,
      userId,
      role: 'OWNER',
      netMonthlyIncomeCents: command.netMonthlyIncomeCents ?? null,
      joinedAt: now,
    });
    const spaces = [
      Space.create({
        id: randomUUID(),
        householdId: household.id,
        kind: 'COMMON',
        ownerUserId: null,
        name: 'Commun',
      }),
      Space.create({
        id: randomUUID(),
        householdId: household.id,
        kind: 'PERSONAL',
        ownerUserId: userId,
        name: 'Perso',
      }),
    ];

    await this.households.createHousehold(household, membership, spaces);

    const snapshot = await this.households.findSnapshotByUserId(userId);
    return this.view.build(snapshot!, userId);
  }
}
