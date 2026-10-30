import { ConflictException, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { MAX_HOUSEHOLD_MEMBERS } from '../../domain/household/household';
import { HouseholdRepository } from '../../domain/household/household.repository';
import { Invitation } from '../../domain/household/invitation';
import { SpaceAccessService } from './space-access.service';

@Injectable()
export class CreateInvitationUseCase {
  constructor(
    private readonly households: HouseholdRepository,
    private readonly access: SpaceAccessService,
  ) {}

  async execute(userId: string): Promise<{ code: string; expiresAt: string }> {
    const snapshot = await this.access.requireSnapshot(userId);
    if (snapshot.memberships.length >= MAX_HOUSEHOLD_MEMBERS) {
      throw new ConflictException('Le foyer est complet');
    }

    const invitation = Invitation.issue(
      {
        code: randomBytes(18).toString('base64url'),
        householdId: snapshot.household.id,
        createdBy: userId,
      },
      new Date(),
    );
    await this.households.saveInvitation(invitation);

    return {
      code: invitation.code,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }
}
