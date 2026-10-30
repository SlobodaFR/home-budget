import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MAX_HOUSEHOLD_MEMBERS } from '../../domain/household/household';
import { HouseholdRepository } from '../../domain/household/household.repository';
import { Membership } from '../../domain/household/membership';
import { Space } from '../../domain/space/space';
import { HouseholdDto, HouseholdViewBuilder } from './household.dto';

@Injectable()
export class JoinHouseholdUseCase {
  constructor(
    private readonly households: HouseholdRepository,
    private readonly view: HouseholdViewBuilder,
  ) {}

  async execute(userId: string, code: string): Promise<HouseholdDto> {
    const now = new Date();
    const invitation = await this.households.findInvitationByCode(code);
    if (!invitation || !invitation.isUsable(now)) {
      throw new NotFoundException(
        'Invitation inconnue, expiree ou deja utilisee',
      );
    }
    if (await this.households.findSnapshotByUserId(userId)) {
      throw new ConflictException('Vous avez deja un foyer');
    }

    const target = await this.households.findSnapshotByHouseholdId(
      invitation.householdId,
    );
    if (!target) {
      throw new NotFoundException(
        'Invitation inconnue, expiree ou deja utilisee',
      );
    }
    if (target.memberships.length >= MAX_HOUSEHOLD_MEMBERS) {
      throw new ConflictException('Le foyer est complet');
    }

    await this.households.join(
      invitation.consume(userId, now),
      Membership.create({
        householdId: invitation.householdId,
        userId,
        role: 'MEMBER',
        netMonthlyIncomeCents: null,
        joinedAt: now,
      }),
      Space.create({
        id: randomUUID(),
        householdId: invitation.householdId,
        kind: 'PERSONAL',
        ownerUserId: userId,
        name: 'Perso',
      }),
    );

    const snapshot = await this.households.findSnapshotByUserId(userId);
    return this.view.build(snapshot!, userId);
  }
}
