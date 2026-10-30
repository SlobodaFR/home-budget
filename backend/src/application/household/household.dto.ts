import { Injectable } from '@nestjs/common';
import { ContributionMode } from '../../domain/household/household';
import { HouseholdSnapshot } from '../../domain/household/household.repository';
import { MembershipRole } from '../../domain/household/membership';
import { SpaceKind, isVisibleTo } from '../../domain/space/space';
import { UserRepository } from '../../domain/user/user.repository';

export interface HouseholdDto {
  id: string;
  name: string;
  role: MembershipRole;
  contributionMode: ContributionMode;
  members: {
    userId: string;
    name: string;
    role: MembershipRole;
    netMonthlyIncomeCents: number | null;
  }[];
  /** Espace commun + espace personnel de l'utilisateur courant, jamais celui des autres. */
  spaces: { id: string; kind: SpaceKind; name: string }[];
}

/** Construit la vue d'un foyer pour un utilisateur donne. */
@Injectable()
export class HouseholdViewBuilder {
  constructor(private readonly users: UserRepository) {}

  async build(
    snapshot: HouseholdSnapshot,
    userId: string,
  ): Promise<HouseholdDto> {
    const me = snapshot.memberships.find((m) => m.userId === userId);
    const members = await Promise.all(
      snapshot.memberships.map(async (membership) => ({
        userId: membership.userId,
        name: (await this.users.findById(membership.userId))?.name ?? 'Membre',
        role: membership.role,
        netMonthlyIncomeCents: membership.netMonthlyIncomeCents,
      })),
    );
    const spaces = snapshot.spaces
      .filter((space) => isVisibleTo(space, userId))
      .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'COMMON' ? -1 : 1))
      .map((space) => ({ id: space.id, kind: space.kind, name: space.name }));

    return {
      id: snapshot.household.id,
      name: snapshot.household.name,
      role: me?.role ?? 'MEMBER',
      contributionMode: snapshot.household.contributionMode,
      members,
      spaces,
    };
  }
}
