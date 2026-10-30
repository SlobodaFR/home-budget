import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  ContributionMode,
  Household,
} from '../../../domain/household/household';
import {
  HouseholdRepository,
  HouseholdSnapshot,
} from '../../../domain/household/household.repository';
import { Invitation } from '../../../domain/household/invitation';
import {
  Membership,
  MembershipRole,
} from '../../../domain/household/membership';
import { Space, SpaceKind } from '../../../domain/space/space';
import { HouseholdOrmEntity } from '../entities/household.orm-entity';
import { InvitationOrmEntity } from '../entities/invitation.orm-entity';
import { MembershipOrmEntity } from '../entities/membership.orm-entity';
import { SpaceOrmEntity } from '../entities/space.orm-entity';

@Injectable()
export class TypeOrmHouseholdRepository extends HouseholdRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async findSnapshotByUserId(
    userId: string,
  ): Promise<HouseholdSnapshot | null> {
    const membership = await this.dataSource
      .getRepository(MembershipOrmEntity)
      .findOne({ where: { userId } });
    return membership
      ? this.findSnapshotByHouseholdId(membership.householdId)
      : null;
  }

  async findSnapshotByHouseholdId(
    householdId: string,
  ): Promise<HouseholdSnapshot | null> {
    const household = await this.dataSource
      .getRepository(HouseholdOrmEntity)
      .findOne({ where: { id: householdId } });
    if (!household) {
      return null;
    }
    const [memberships, spaces] = await Promise.all([
      this.dataSource
        .getRepository(MembershipOrmEntity)
        .find({ where: { householdId }, order: { joinedAt: 'ASC' } }),
      this.dataSource
        .getRepository(SpaceOrmEntity)
        .find({ where: { householdId } }),
    ]);
    return {
      household: toHousehold(household),
      memberships: memberships.map(toMembership),
      spaces: spaces.map(toSpace),
    };
  }

  async createHousehold(
    household: Household,
    ownerMembership: Membership,
    spaces: Space[],
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.save(HouseholdOrmEntity, fromHousehold(household));
      await manager.save(MembershipOrmEntity, fromMembership(ownerMembership));
      await manager.save(SpaceOrmEntity, spaces.map(fromSpace));
    });
  }

  async saveHousehold(household: Household): Promise<void> {
    await this.dataSource
      .getRepository(HouseholdOrmEntity)
      .save(fromHousehold(household));
  }

  async saveMembership(membership: Membership): Promise<void> {
    await this.dataSource
      .getRepository(MembershipOrmEntity)
      .save(fromMembership(membership));
  }

  async saveInvitation(invitation: Invitation): Promise<void> {
    await this.dataSource
      .getRepository(InvitationOrmEntity)
      .save(fromInvitation(invitation));
  }

  async findInvitationByCode(code: string): Promise<Invitation | null> {
    const row = await this.dataSource
      .getRepository(InvitationOrmEntity)
      .findOne({ where: { code } });
    return row ? toInvitation(row) : null;
  }

  async join(
    consumedInvitation: Invitation,
    membership: Membership,
    personalSpace: Space,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager: EntityManager) => {
      await manager.save(
        InvitationOrmEntity,
        fromInvitation(consumedInvitation),
      );
      await manager.save(MembershipOrmEntity, fromMembership(membership));
      await manager.save(SpaceOrmEntity, fromSpace(personalSpace));
    });
  }
}

function toHousehold(row: HouseholdOrmEntity): Household {
  return Household.create({
    id: row.id,
    name: row.name,
    contributionMode: row.contributionMode as ContributionMode,
    createdAt: new Date(row.createdAt),
  });
}

function fromHousehold(household: Household): HouseholdOrmEntity {
  return {
    id: household.id,
    name: household.name,
    contributionMode: household.contributionMode,
    createdAt: household.createdAt.toISOString(),
  };
}

function toMembership(row: MembershipOrmEntity): Membership {
  return Membership.create({
    householdId: row.householdId,
    userId: row.userId,
    role: row.role as MembershipRole,
    netMonthlyIncomeCents: row.netMonthlyIncomeCents,
    joinedAt: new Date(row.joinedAt),
  });
}

function fromMembership(membership: Membership): MembershipOrmEntity {
  return {
    householdId: membership.householdId,
    userId: membership.userId,
    role: membership.role,
    netMonthlyIncomeCents: membership.netMonthlyIncomeCents,
    joinedAt: membership.joinedAt.toISOString(),
  };
}

function toSpace(row: SpaceOrmEntity): Space {
  return Space.create({
    id: row.id,
    householdId: row.householdId,
    kind: row.kind as SpaceKind,
    ownerUserId: row.ownerUserId,
    name: row.name,
  });
}

function fromSpace(space: Space): SpaceOrmEntity {
  return {
    id: space.id,
    householdId: space.householdId,
    kind: space.kind,
    ownerUserId: space.ownerUserId,
    name: space.name,
  };
}

function toInvitation(row: InvitationOrmEntity): Invitation {
  return Invitation.restore({
    code: row.code,
    householdId: row.householdId,
    createdBy: row.createdBy,
    expiresAt: new Date(row.expiresAt),
    usedAt: row.usedAt ? new Date(row.usedAt) : null,
    usedBy: row.usedBy,
  });
}

function fromInvitation(invitation: Invitation): InvitationOrmEntity {
  return {
    code: invitation.code,
    householdId: invitation.householdId,
    createdBy: invitation.createdBy,
    expiresAt: invitation.expiresAt.toISOString(),
    usedAt: invitation.usedAt ? invitation.usedAt.toISOString() : null,
    usedBy: invitation.usedBy,
  };
}
