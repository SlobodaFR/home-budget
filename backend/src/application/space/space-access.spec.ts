import { NotFoundException } from '@nestjs/common';
import { User } from '../../domain/user/user';
import {
  InMemoryHouseholdRepository,
  InMemorySpacePlanRepository,
  InMemoryTransactionRepository,
  InMemoryUserRepository,
} from '../../testing/in-memory-repositories';
import { CreateHouseholdUseCase } from '../household/create-household.use-case';
import { CreateInvitationUseCase } from '../household/create-invitation.use-case';
import { HouseholdViewBuilder } from '../household/household.dto';
import { JoinHouseholdUseCase } from '../household/join-household.use-case';
import { SpaceAccessService } from '../household/space-access.service';
import {
  GetSpacePlanUseCase,
  SaveSpacePlanUseCase,
} from './space-plan.use-cases';
import {
  CreateSpaceTransactionUseCase,
  DeleteSpaceTransactionUseCase,
  GetMonthSummaryUseCase,
  ListSpaceTransactionsUseCase,
  UpdateSpaceTransactionUseCase,
} from './space-transaction.use-cases';

async function twoPeopleHousehold() {
  const households = new InMemoryHouseholdRepository();
  const users = new InMemoryUserRepository();
  for (const id of ['alice', 'bob', 'mallory']) {
    await users.save(
      User.create({
        id,
        email: `${id}@example.test`,
        name: id,
        avatarUrl: '',
        createdAt: new Date(),
      }),
    );
  }
  const view = new HouseholdViewBuilder(users);
  const access = new SpaceAccessService(households);
  const plans = new InMemorySpacePlanRepository();
  const transactions = new InMemoryTransactionRepository();

  const created = await new CreateHouseholdUseCase(households, view).execute(
    'alice',
    { name: 'F' },
  );
  const { code } = await new CreateInvitationUseCase(
    households,
    access,
  ).execute('alice');
  await new JoinHouseholdUseCase(households, view).execute('bob', code);

  return {
    access,
    commonId: created.spaces.find((s) => s.kind === 'COMMON')!.id,
    alicePersonalId: created.spaces.find((s) => s.kind === 'PERSONAL')!.id,
    bobPersonalId: households.spaces.find((s) => s.ownerUserId === 'bob')!.id,
    getPlan: new GetSpacePlanUseCase(access, plans),
    savePlan: new SaveSpacePlanUseCase(access, plans),
    list: new ListSpaceTransactionsUseCase(access, transactions),
    create: new CreateSpaceTransactionUseCase(access, transactions),
    update: new UpdateSpaceTransactionUseCase(access, transactions),
    remove: new DeleteSpaceTransactionUseCase(access, transactions),
    summary: new GetMonthSummaryUseCase(access, plans, transactions),
  };
}

const expense = {
  kind: 'EXPENSE' as const,
  bloc: 'PLAISIR' as const,
  label: 'Cadeau',
  amountCents: 4200,
  date: new Date('2026-10-12T00:00:00Z'),
};

describe('space access (isolation of personal spaces)', () => {
  it('lets both members use the common space', async () => {
    const s = await twoPeopleHousehold();
    const created = await s.create.execute('alice', s.commonId, expense);
    const listed = await s.list.execute('bob', s.commonId, '2026-10');
    expect(listed.map((t) => t.id)).toEqual([created.id]);
  });

  it('lets the owner use her personal space', async () => {
    const s = await twoPeopleHousehold();
    await s.create.execute('alice', s.alicePersonalId, expense);
    expect(
      await s.list.execute('alice', s.alicePersonalId, '2026-10'),
    ).toHaveLength(1);
  });

  it('hides a personal space from the other member on every use case', async () => {
    const s = await twoPeopleHousehold();
    const created = await s.create.execute('alice', s.alicePersonalId, expense);
    const id = s.alicePersonalId;
    const attempts: Promise<unknown>[] = [
      s.getPlan.execute('bob', id),
      s.savePlan.execute('bob', id, {
        incomeCents: 1,
        fixeCents: 0,
        courantCents: 0,
        plaisirCents: 0,
        epargneCents: 0,
      }),
      s.list.execute('bob', id, '2026-10'),
      s.create.execute('bob', id, expense),
      s.update.execute('bob', id, created.id, expense),
      s.remove.execute('bob', id, created.id),
      s.summary.execute('bob', id, '2026-10'),
    ];
    for (const attempt of attempts) {
      await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(await s.list.execute('alice', id, '2026-10')).toHaveLength(1);
  });

  it('hides every space from a user without a household', async () => {
    const s = await twoPeopleHousehold();
    await expect(
      s.list.execute('mallory', s.commonId, '2026-10'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      s.getPlan.execute('mallory', s.alicePersonalId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not let a transaction be reached through another space', async () => {
    const s = await twoPeopleHousehold();
    const created = await s.create.execute('alice', s.alicePersonalId, expense);
    await expect(
      s.remove.execute('alice', s.commonId, created.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      s.update.execute('alice', s.commonId, created.id, expense),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('summarizes a month from the plan and the transactions', async () => {
    const s = await twoPeopleHousehold();
    await s.savePlan.execute('alice', s.commonId, {
      incomeCents: 0,
      fixeCents: 100000,
      courantCents: 50000,
      plaisirCents: 10000,
      epargneCents: 20000,
    });
    await s.create.execute('alice', s.commonId, expense);
    const summary = await s.summary.execute('bob', s.commonId, '2026-10');
    expect(summary.blocs.find((b) => b.bloc === 'PLAISIR')).toEqual({
      bloc: 'PLAISIR',
      plannedCents: 10000,
      actualCents: 4200,
      gapCents: -5800,
    });
  });

  it('rejects a malformed expense through the domain invariants', async () => {
    const s = await twoPeopleHousehold();
    await expect(
      s.create.execute('alice', s.commonId, {
        kind: 'EXPENSE',
        label: 'x',
        amountCents: 100,
      }),
    ).rejects.toThrow('bloc');
    await expect(
      s.create.execute('alice', s.commonId, {
        kind: 'EXPENSE',
        bloc: 'FIXE',
        label: 'x',
        amountCents: 0,
      }),
    ).rejects.toThrow('positif');
  });
});
