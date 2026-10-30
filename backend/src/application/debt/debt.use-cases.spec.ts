import { NotFoundException } from '@nestjs/common';
import { DomainError } from '../../domain/shared/domain-error';
import { User } from '../../domain/user/user';
import { FakeClock } from '../../testing/fake-clock';
import {
  InMemoryDebtRepository,
  InMemoryHouseholdRepository,
  InMemoryRecurringItemRepository,
  InMemoryUserRepository,
} from '../../testing/in-memory-repositories';
import { AccountAssignmentService } from '../account/account-assignment.service';
import { CreateHouseholdUseCase } from '../household/create-household.use-case';
import { CreateInvitationUseCase } from '../household/create-invitation.use-case';
import { HouseholdViewBuilder } from '../household/household.dto';
import { JoinHouseholdUseCase } from '../household/join-household.use-case';
import { SpaceAccessService } from '../household/space-access.service';
import { SetMyIncomeUseCase } from '../household/update-household-settings.use-case';
import { CreateRecurringItemUseCase } from '../recurring/recurring.use-cases';
import {
  CreateDebtUseCase,
  DebtWhatIfUseCase,
  DeleteDebtUseCase,
  GetDebtsSummaryUseCase,
  ListDebtsUseCase,
  SaveDebtCommand,
  UpdateDebtUseCase,
} from './debt.use-cases';
import { DebtViewsService } from './debt-views.service';
import { InMemoryAccountRepository } from '../../testing/in-memory-repositories';

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
  const debts = new InMemoryDebtRepository();
  const recurring = new InMemoryRecurringItemRepository();
  const clock = FakeClock.at('2026-10-30T09:00:00Z');
  const views = new DebtViewsService(debts, access, clock);

  const created = await new CreateHouseholdUseCase(households, view).execute(
    'alice',
    { name: 'F', netMonthlyIncomeCents: 300000 },
  );
  const { code } = await new CreateInvitationUseCase(
    households,
    access,
  ).execute('alice');
  await new JoinHouseholdUseCase(households, view).execute('bob', code);

  return {
    clock,
    commonId: created.spaces.find((s) => s.kind === 'COMMON')!.id,
    alicePersonalId: created.spaces.find((s) => s.kind === 'PERSONAL')!.id,
    bobPersonalId: households.spaces.find((s) => s.ownerUserId === 'bob')!.id,
    list: new ListDebtsUseCase(access, views),
    summary: new GetDebtsSummaryUseCase(access, views),
    create: new CreateDebtUseCase(access, debts, recurring, clock),
    update: new UpdateDebtUseCase(access, debts, recurring),
    remove: new DeleteDebtUseCase(access, debts),
    whatIf: new DebtWhatIfUseCase(access, debts, clock),
    createRecurring: new CreateRecurringItemUseCase(
      access,
      recurring,
      new AccountAssignmentService(new InMemoryAccountRepository()),
    ),
    setIncome: new SetMyIncomeUseCase(households, access),
  };
}

const auto: SaveDebtCommand = {
  name: 'Prêt auto',
  kind: 'CAR',
  principalCents: 1500000,
  remainingCents: 1120000,
  annualRatePercent: 3.9,
  monthlyPaymentCents: 32000,
  startDate: '2024-09-01',
  paymentDay: 5,
  insuranceMonthlyCents: 1500,
};

describe('debt use cases', () => {
  it('creates a debt with the simulated amortization (contract shape and figures)', async () => {
    const s = await setup();
    const created = await s.create.execute('alice', s.commonId, auto);
    expect(created).toEqual({
      id: expect.any(String),
      spaceId: s.commonId,
      name: 'Prêt auto',
      kind: 'CAR',
      principalCents: 1500000,
      remainingCents: 1120000,
      annualRatePercent: 3.9,
      monthlyPaymentCents: 32000,
      startDate: '2024-09-01',
      paymentDay: 5,
      insuranceMonthlyCents: 1500,
      monthsRemaining: 38,
      payoffDate: '2029-12-05',
      totalInterestRemainingCents: 70926,
      paidSharePercent: 25,
      archived: false,
      recurringId: null,
    });
    expect('neverPaidOff' in created).toBe(false);
    expect(await s.list.execute('bob', s.commonId)).toEqual([created]);
  });

  it('flags neverPaidOff and nulls the figures when the payment does not cover the interest', async () => {
    const s = await setup();
    const created = await s.create.execute('alice', s.commonId, {
      ...auto,
      monthlyPaymentCents: 3640,
    });
    expect(created).toMatchObject({
      neverPaidOff: true,
      monthsRemaining: null,
      payoffDate: null,
      totalInterestRemainingCents: null,
    });
  });

  it('accepts a rate with 2 decimals at most, without float drift', async () => {
    const s = await setup();
    for (const [input, back] of [
      [3.5, 3.5],
      [0.07, 0.07],
      [0, 0],
      [12.34, 12.34],
      [100, 100],
    ]) {
      const debt = await s.create.execute('alice', s.commonId, {
        ...auto,
        name: `T${input}`,
        annualRatePercent: input,
      });
      expect(debt.annualRatePercent).toBe(back);
    }
    for (const bad of [3.905, 3.999, -0.5, 100.01, Number.NaN]) {
      await expect(
        s.create.execute('alice', s.commonId, {
          ...auto,
          name: 'Bad',
          annualRatePercent: bad,
        }),
      ).rejects.toBeInstanceOf(DomainError);
    }
  });

  it('validates the other fields', async () => {
    const s = await setup();
    for (const bad of [
      { name: '' },
      { name: 'x'.repeat(61) },
      { kind: 'YACHT' as never },
      { principalCents: 0 },
      { remainingCents: 1500001 },
      { remainingCents: -1 },
      { paymentDay: 0 },
      { paymentDay: 29 },
      { monthlyPaymentCents: -1 },
      { insuranceMonthlyCents: -1 },
      { startDate: '2026-02-30' },
    ]) {
      await expect(
        s.create.execute('alice', s.commonId, { ...auto, ...bad }),
      ).rejects.toBeInstanceOf(DomainError);
    }
  });

  it('updates, archives (sorted last), and deletes', async () => {
    const s = await setup();
    const a = await s.create.execute('alice', s.commonId, auto);
    await s.create.execute('alice', s.commonId, {
      ...auto,
      name: 'Maison',
      kind: 'MORTGAGE',
    });
    await s.update.execute('bob', s.commonId, a.id, {
      ...auto,
      name: 'Auto',
      remainingCents: 1000000,
      archived: true,
    });
    const listed = await s.list.execute('alice', s.commonId);
    expect(listed.map((d) => [d.name, d.archived])).toEqual([
      ['Maison', false],
      ['Auto', true],
    ]);
    expect(listed[1].remainingCents).toBe(1000000);
    // `archived` absent : inchangé.
    await s.update.execute('bob', s.commonId, a.id, { ...auto, name: 'Auto' });
    expect((await s.list.execute('alice', s.commonId))[1].archived).toBe(true);
    await s.remove.execute('alice', s.commonId, a.id);
    expect(await s.list.execute('alice', s.commonId)).toHaveLength(1);
    await expect(
      s.remove.execute('alice', s.commonId, a.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('only accepts a recurring payment of the same space', async () => {
    const s = await setup();
    const rec = {
      kind: 'EXPENSE' as const,
      bloc: 'FIXE' as const,
      label: 'Mensualité auto',
      amountCents: 32000,
      dayOfMonth: 5,
      startDate: '2026-01-01',
      endDate: null,
      active: true,
    };
    const common = await s.createRecurring.execute('alice', s.commonId, rec);
    const personal = await s.createRecurring.execute(
      'alice',
      s.alicePersonalId,
      rec,
    );
    const linked = await s.create.execute('alice', s.commonId, {
      ...auto,
      recurringId: common.id,
    });
    expect(linked.recurringId).toBe(common.id);
    for (const id of ['nope', personal.id]) {
      await expect(
        s.create.execute('alice', s.commonId, {
          ...auto,
          name: 'X',
          recurringId: id,
        }),
      ).rejects.toThrow(/n'existe pas dans cet espace/);
      await expect(
        s.update.execute('alice', s.commonId, linked.id, {
          ...auto,
          recurringId: id,
        }),
      ).rejects.toBeInstanceOf(DomainError);
    }
    await s.update.execute('alice', s.commonId, linked.id, {
      ...auto,
      recurringId: null,
    });
    expect(
      (await s.list.execute('alice', s.commonId))[0].recurringId,
    ).toBeNull();
  });

  it('answers 404 for an unknown debt or a debt of another space', async () => {
    const s = await setup();
    const mine = await s.create.execute('alice', s.alicePersonalId, auto);
    for (const attempt of [
      s.update.execute('alice', s.commonId, mine.id, auto),
      s.remove.execute('alice', s.commonId, mine.id),
      s.whatIf.execute('alice', s.commonId, mine.id, 1000, 0),
      s.whatIf.execute('alice', s.commonId, 'nope', 1000, 0),
    ]) {
      await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
    }
  });
});

describe('what-if use case', () => {
  it('simulates and validates the amounts', async () => {
    const s = await setup();
    const house = await s.create.execute('alice', s.commonId, {
      ...auto,
      name: 'Maison',
      kind: 'MORTGAGE',
      principalCents: 12000000,
      remainingCents: 10000000,
      annualRatePercent: 3.5,
      monthlyPaymentCents: 58000,
    });
    const result = await s.whatIf.execute(
      'bob',
      s.commonId,
      house.id,
      10000,
      2000000,
    );
    expect(result.baseline).toMatchObject({
      monthsRemaining: 240,
      totalInterestRemainingCents: 3918606,
    });
    expect(result.scenario).toMatchObject({
      monthsRemaining: 145,
      totalInterestRemainingCents: 1812835,
    });
    expect(result.monthsSaved).toBe(95);
    for (const [extra, lump] of [
      [0, 0],
      [-1, 0],
      [0, -5],
      [1.5, 0],
      [0, 2.5],
    ]) {
      await expect(
        s.whatIf.execute('alice', s.commonId, house.id, extra, lump),
      ).rejects.toBeInstanceOf(DomainError);
    }
    await expect(
      s.whatIf.execute('alice', s.commonId, house.id, 0, 1),
    ).resolves.toBeDefined();
  });
});

describe('summary use case', () => {
  it('sums active debts and divides by the household income (common space)', async () => {
    const s = await setup();
    await s.create.execute('alice', s.commonId, auto); // 32 000 + 1 500
    const home = await s.create.execute('alice', s.commonId, {
      ...auto,
      name: 'Maison',
      kind: 'MORTGAGE',
      principalCents: 25000000,
      remainingCents: 20000000,
      monthlyPaymentCents: 100000,
      insuranceMonthlyCents: 5000,
      annualRatePercent: 3.5,
    });
    await s.create
      .execute('alice', s.commonId, {
        ...auto,
        name: 'Ancien',
        archived: true,
      })
      .then((d) =>
        s.update.execute('alice', s.commonId, d.id, {
          ...auto,
          name: 'Ancien',
          archived: true,
        }),
      );
    await s.create.execute('alice', s.commonId, {
      ...auto,
      name: 'Soldé',
      remainingCents: 0,
    });
    // Seul Alice (3 000 €) a déclaré son revenu : on additionne les revenus connus.
    expect(await s.summary.execute('bob', s.commonId)).toEqual({
      activeCount: 2,
      totalRemainingCents: 1120000 + 20000000,
      totalMonthlyCents: 138500,
      debtToIncomePercent: 46, // 138 500 / 300 000 = 46,17
    });
    await s.setIncome.execute('bob', 150000);
    expect(
      (await s.summary.execute('alice', s.commonId)).debtToIncomePercent,
    ).toBe(31); // 138 500 / 450 000 = 30,78
    expect(home.remainingCents).toBe(20000000);
  });

  it('uses the member income for a personal space and returns null when unknown', async () => {
    const s = await setup();
    await s.create.execute('alice', s.alicePersonalId, auto);
    await s.create.execute('bob', s.bobPersonalId, auto);
    // Alice : 33 500 / 300 000 = 11,17 ; Bob n'a pas déclaré de revenu.
    expect(
      (await s.summary.execute('alice', s.alicePersonalId)).debtToIncomePercent,
    ).toBe(11);
    expect(
      (await s.summary.execute('bob', s.bobPersonalId)).debtToIncomePercent,
    ).toBeNull();
    await s.setIncome.execute('bob', 0);
    expect(
      (await s.summary.execute('bob', s.bobPersonalId)).debtToIncomePercent,
    ).toBeNull();
    await s.setIncome.execute('bob', 67000);
    expect(
      (await s.summary.execute('bob', s.bobPersonalId)).debtToIncomePercent,
    ).toBe(50); // 33 500 / 67 000
  });

  it('is zero without debts', async () => {
    const s = await setup();
    expect(await s.summary.execute('alice', s.commonId)).toEqual({
      activeCount: 0,
      totalRemainingCents: 0,
      totalMonthlyCents: 0,
      debtToIncomePercent: 0,
    });
  });
});

describe('isolation of personal debts', () => {
  it('hides the debts of another member on every use case', async () => {
    const s = await setup();
    const mine = await s.create.execute('alice', s.alicePersonalId, auto);
    const id = s.alicePersonalId;
    for (const attempt of [
      s.list.execute('bob', id),
      s.summary.execute('bob', id),
      s.create.execute('bob', id, auto),
      s.update.execute('bob', id, mine.id, auto),
      s.remove.execute('bob', id, mine.id),
      s.whatIf.execute('bob', id, mine.id, 1000, 0),
    ]) {
      await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
    }
    // Ni depuis le commun ni depuis son propre espace.
    for (const space of [s.commonId, s.bobPersonalId]) {
      await expect(
        s.update.execute('bob', space, mine.id, auto),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        s.remove.execute('bob', space, mine.id),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        s.whatIf.execute('bob', space, mine.id, 1000, 0),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(await s.list.execute('bob', s.commonId)).toEqual([]);
    expect(await s.list.execute('alice', id)).toHaveLength(1);
  });
});
