import { NotFoundException } from '@nestjs/common';
import { DomainError } from '../../domain/shared/domain-error';
import { Transaction } from '../../domain/transaction/transaction';
import { User } from '../../domain/user/user';
import { FakeClock } from '../../testing/fake-clock';
import {
  InMemoryHouseholdRepository,
  InMemoryTransactionRepository,
  InMemoryUserRepository,
} from '../../testing/in-memory-repositories';
import { CreateHouseholdUseCase } from '../household/create-household.use-case';
import { CreateInvitationUseCase } from '../household/create-invitation.use-case';
import { HouseholdViewBuilder } from '../household/household.dto';
import { JoinHouseholdUseCase } from '../household/join-household.use-case';
import { SpaceAccessService } from '../household/space-access.service';
import { CreateSpaceTransactionUseCase } from '../space/space-transaction.use-cases';
import { AccountAssignmentService } from '../account/account-assignment.service';
import { InMemoryAccountRepository } from '../../testing/in-memory-repositories';
import { GetTrendsUseCase } from './get-trends.use-case';

/** Dépôt qui compte et enregistre les lectures par période. */
class CountingTransactionRepository extends InMemoryTransactionRepository {
  periodReads: { spaceId: string; from: Date; to: Date }[] = [];
  async findBySpaceAndPeriod(
    spaceId: string,
    from: Date,
    to: Date,
  ): Promise<Transaction[]> {
    this.periodReads.push({ spaceId, from, to });
    return super.findBySpaceAndPeriod(spaceId, from, to);
  }
}

async function setup() {
  const households = new InMemoryHouseholdRepository();
  const users = new InMemoryUserRepository();
  for (const id of ['alice', 'bob']) {
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
  const transactions = new CountingTransactionRepository();
  const clock = FakeClock.at('2026-10-30T09:00:00Z');
  const created = await new CreateHouseholdUseCase(households, view).execute(
    'alice',
    { name: 'F' },
  );
  const { code } = await new CreateInvitationUseCase(
    households,
    access,
  ).execute('alice');
  await new JoinHouseholdUseCase(households, view).execute('bob', code);
  const assignment = new AccountAssignmentService(
    new InMemoryAccountRepository(),
  );
  return {
    transactions,
    commonId: created.spaces.find((s) => s.kind === 'COMMON')!.id,
    alicePersonalId: created.spaces.find((s) => s.kind === 'PERSONAL')!.id,
    trends: new GetTrendsUseCase(access, transactions, clock),
    create: new CreateSpaceTransactionUseCase(access, transactions, assignment),
  };
}

const spend = (label: string, amountCents: number, date: string) => ({
  kind: 'EXPENSE' as const,
  bloc: 'COURANT' as const,
  label,
  amountCents,
  date: new Date(`${date}T10:00:00Z`),
});

describe('GetTrendsUseCase', () => {
  it('defaults to 6 months ending at the current month, with a single bounded read', async () => {
    const s = await setup();
    await s.create.execute(
      'alice',
      s.commonId,
      spend('Courses', 10000, '2026-10-03'),
    );
    const result = await s.trends.execute('bob', s.commonId);
    expect(result.from).toBe('2026-05');
    expect(result.to).toBe('2026-10');
    expect(result.months).toHaveLength(6);
    expect(result.topLabels[0]).toMatchObject({
      label: 'Courses',
      totalCents: 10000,
    });
    expect(s.transactions.periodReads).toHaveLength(1);
    expect(s.transactions.periodReads[0].from.toISOString()).toBe(
      '2026-05-01T00:00:00.000Z',
    );
    expect(s.transactions.periodReads[0].to.toISOString()).toBe(
      '2026-11-01T00:00:00.000Z',
    );
  });

  it('honours months and to, still with one read, whatever the window size', async () => {
    const s = await setup();
    await s.create.execute(
      'alice',
      s.commonId,
      spend('Courses', 10000, '2025-03-03'),
    );
    const result = await s.trends.execute('alice', s.commonId, 24, '2026-02');
    expect(result.from).toBe('2024-03');
    expect(result.months).toHaveLength(24);
    expect(result.months[12].expenseCents).toBe(10000);
    expect(s.transactions.periodReads).toHaveLength(1);
    expect(s.transactions.periodReads[0].from.toISOString()).toBe(
      '2024-03-01T00:00:00.000Z',
    );
    expect(s.transactions.periodReads[0].to.toISOString()).toBe(
      '2026-03-01T00:00:00.000Z',
    );
  });

  it('rejects invalid windows with a domain error', async () => {
    const s = await setup();
    for (const [months, to] of [
      [2, undefined],
      [25, undefined],
      [3.5, undefined],
      [3, '2000-02'],
      [24, '2001-11'],
      [6, '2026-13'],
      [6, 'octobre'],
    ] as const) {
      await expect(
        s.trends.execute('alice', s.commonId, months, to),
      ).rejects.toBeInstanceOf(DomainError);
    }
    expect(s.transactions.periodReads).toHaveLength(0);
  });

  it('never reads or shows the labels of a space the user cannot see', async () => {
    const s = await setup();
    await s.create.execute(
      'alice',
      s.alicePersonalId,
      spend('Cadeau secret', 4200, '2026-10-12'),
    );
    await expect(
      s.trends.execute('bob', s.alicePersonalId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(s.transactions.periodReads).toHaveLength(0);
    const common = await s.trends.execute('bob', s.commonId);
    expect(JSON.stringify(common)).not.toContain('Cadeau');
    expect(
      (await s.trends.execute('alice', s.alicePersonalId)).topLabels[0].label,
    ).toBe('Cadeau secret');
  });
});
