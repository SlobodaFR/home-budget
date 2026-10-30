import { User } from '../../domain/user/user';
import { SpacePlan } from '../../domain/space/space-plan';
import {
  InMemoryHouseholdRepository,
  InMemorySpacePlanRepository,
  InMemoryUserRepository,
} from '../../testing/in-memory-repositories';
import { CreateHouseholdUseCase } from '../household/create-household.use-case';
import { CreateInvitationUseCase } from '../household/create-invitation.use-case';
import { HouseholdViewBuilder } from '../household/household.dto';
import { JoinHouseholdUseCase } from '../household/join-household.use-case';
import { SpaceAccessService } from '../household/space-access.service';
import {
  SetContributionModeUseCase,
  SetMyIncomeUseCase,
} from '../household/update-household-settings.use-case';
import { GetContributionUseCase } from './get-contribution.use-case';

async function setup() {
  const households = new InMemoryHouseholdRepository();
  const users = new InMemoryUserRepository();
  for (const [id, name] of [
    ['alice', 'Alice'],
    ['bob', 'Bob'],
  ]) {
    await users.save(
      User.create({
        id,
        email: `${id}@example.test`,
        name,
        avatarUrl: '',
        createdAt: new Date(),
      }),
    );
  }
  const view = new HouseholdViewBuilder(users);
  const access = new SpaceAccessService(households);
  const plans = new InMemorySpacePlanRepository();
  const created = await new CreateHouseholdUseCase(households, view).execute(
    'alice',
    {
      name: 'F',
      netMonthlyIncomeCents: 350000,
    },
  );
  const { code } = await new CreateInvitationUseCase(
    households,
    access,
  ).execute('alice');
  await new JoinHouseholdUseCase(households, view).execute('bob', code);
  const commonId = created.spaces.find((s) => s.kind === 'COMMON')!.id;
  plans.plans.set(
    commonId,
    SpacePlan.create({
      incomeCents: 0,
      fixeCents: 175000,
      courantCents: 100000,
      plaisirCents: 30000,
      epargneCents: 25000,
    }),
  );
  return {
    contribution: new GetContributionUseCase(access, plans, users),
    setIncome: new SetMyIncomeUseCase(households, access),
    setMode: new SetContributionModeUseCase(households, access),
  };
}

describe('GetContributionUseCase', () => {
  it('flags an incomplete household until everyone declares an income', async () => {
    const { contribution } = await setup();
    const result = await contribution.execute('alice');
    expect(result.incomplete).toBe(true);
    expect(result.commonNeedCents).toBe(330000);
  });

  it('computes the share of each member from the common plan', async () => {
    const { contribution, setIncome, setMode } = await setup();
    await setIncome.execute('bob', 200000);

    const proportional = await contribution.execute('bob');
    expect(
      proportional.shares.map((s) => [
        s.name,
        s.contributionCents,
        s.remainingCents,
      ]),
    ).toEqual([
      ['Alice', 210000, 140000],
      ['Bob', 120000, 80000],
    ]);

    await setMode.execute('alice', 'EQUAL_REMAINDER');
    const equalRemainder = await contribution.execute('alice');
    expect(equalRemainder.shares.map((s) => s.remainingCents)).toEqual([
      110000, 110000,
    ]);
  });
});
