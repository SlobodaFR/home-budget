import { Household } from '../domain/household/household';
import {
  HouseholdRepository,
  HouseholdSnapshot,
} from '../domain/household/household.repository';
import { Invitation } from '../domain/household/invitation';
import { Membership } from '../domain/household/membership';
import { Space } from '../domain/space/space';
import { SpacePlan } from '../domain/space/space-plan';
import { SpacePlanRepository } from '../domain/space/space-plan.repository';
import { Transaction } from '../domain/transaction/transaction';
import { TransactionRepository } from '../domain/transaction/transaction.repository';
import { ClassificationRule } from '../domain/import/classification';
import { SpaceRulesRepository } from '../domain/import/space-rules.repository';
import { User } from '../domain/user/user';
import { UserRepository } from '../domain/user/user.repository';

/** Doubles de test : reproduisent le contrat des ports, y compris « tous les espaces ». */
export class InMemoryHouseholdRepository extends HouseholdRepository {
  households = new Map<string, Household>();
  memberships: Membership[] = [];
  spaces: Space[] = [];
  invitations = new Map<string, Invitation>();

  async findSnapshotByUserId(
    userId: string,
  ): Promise<HouseholdSnapshot | null> {
    const membership = this.memberships.find((m) => m.userId === userId);
    return membership
      ? this.findSnapshotByHouseholdId(membership.householdId)
      : null;
  }

  async findSnapshotByHouseholdId(
    id: string,
  ): Promise<HouseholdSnapshot | null> {
    const household = this.households.get(id);
    if (!household) return null;
    return {
      household,
      memberships: this.memberships.filter((m) => m.householdId === id),
      spaces: this.spaces.filter((s) => s.householdId === id),
    };
  }

  async createHousehold(
    h: Household,
    owner: Membership,
    spaces: Space[],
  ): Promise<void> {
    this.households.set(h.id, h);
    this.memberships.push(owner);
    this.spaces.push(...spaces);
  }

  async saveHousehold(h: Household): Promise<void> {
    this.households.set(h.id, h);
  }

  async saveMembership(m: Membership): Promise<void> {
    this.memberships = this.memberships.map((x) =>
      x.userId === m.userId ? m : x,
    );
  }

  async saveInvitation(i: Invitation): Promise<void> {
    this.invitations.set(i.code, i);
  }

  async findInvitationByCode(code: string): Promise<Invitation | null> {
    return this.invitations.get(code) ?? null;
  }

  async join(i: Invitation, m: Membership, space: Space): Promise<void> {
    this.invitations.set(i.code, i);
    this.memberships.push(m);
    this.spaces.push(space);
  }
}

export class InMemorySpacePlanRepository extends SpacePlanRepository {
  plans = new Map<string, SpacePlan>();
  async find(spaceId: string): Promise<SpacePlan | null> {
    return this.plans.get(spaceId) ?? null;
  }
  async save(spaceId: string, plan: SpacePlan): Promise<void> {
    this.plans.set(spaceId, plan);
  }
}

export class InMemoryTransactionRepository extends TransactionRepository {
  items = new Map<string, Transaction>();

  async findBySpaceAndPeriod(
    spaceId: string,
    from: Date,
    to: Date,
  ): Promise<Transaction[]> {
    return [...this.items.values()]
      .filter((t) => t.spaceId === spaceId && t.date >= from && t.date < to)
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }
  async findById(id: string): Promise<Transaction | null> {
    return this.items.get(id) ?? null;
  }
  async save(t: Transaction): Promise<void> {
    this.items.set(t.id, t);
  }
  async saveMany(ts: Transaction[]): Promise<void> {
    for (const t of ts) this.items.set(t.id, t);
  }
  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }
}

export class InMemoryUserRepository extends UserRepository {
  users = new Map<string, User>();
  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }
  async findByEmail(email: string): Promise<User | null> {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }
  async save(user: User): Promise<void> {
    this.users.set(user.id, user);
  }
}

export class InMemorySpaceRulesRepository extends SpaceRulesRepository {
  rules = new Map<string, ClassificationRule[]>();
  async find(spaceId: string): Promise<ClassificationRule[] | null> {
    return this.rules.get(spaceId) ?? null;
  }
  async save(spaceId: string, rules: ClassificationRule[]): Promise<void> {
    this.rules.set(spaceId, rules);
  }
}
