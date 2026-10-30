import { NotFoundException } from '@nestjs/common';
import { Account } from '../../domain/account/account';
import { DomainError } from '../../domain/shared/domain-error';
import { SpacePlan } from '../../domain/space/space-plan';
import { User } from '../../domain/user/user';
import { FakeClock } from '../../testing/fake-clock';
import {
  InMemoryAccountRepository,
  InMemoryHouseholdRepository,
  InMemorySpacePlanRepository,
  InMemoryTransactionRepository,
  InMemoryUserRepository,
} from '../../testing/in-memory-repositories';
import { AccountAssignmentService } from '../account/account-assignment.service';
import { CreateHouseholdUseCase } from '../household/create-household.use-case';
import { CreateInvitationUseCase } from '../household/create-invitation.use-case';
import { HouseholdViewBuilder } from '../household/household.dto';
import { JoinHouseholdUseCase } from '../household/join-household.use-case';
import { SpaceAccessService } from '../household/space-access.service';
import {
  SetContributionModeUseCase,
  SetMyIncomeUseCase,
} from '../household/update-household-settings.use-case';
import {
  DeleteSpaceTransactionUseCase,
  UpdateSpaceTransactionUseCase,
} from '../space/space-transaction.use-cases';
import { ContributionStatusService } from './contribution-status.service';
import { GetContributionStatusUseCase } from './get-contribution-status.use-case';
import { GetContributionUseCase } from './get-contribution.use-case';
import { RecordContributionPaymentUseCase } from './record-contribution-payment.use-case';

async function setup() {
  const households = new InMemoryHouseholdRepository();
  const users = new InMemoryUserRepository();
  for (const [id, name] of [
    ['alice', 'Alice Martin'],
    ['bob', 'Bob'],
    ['carol', 'Carol'],
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
  const transactions = new InMemoryTransactionRepository();
  const accounts = new InMemoryAccountRepository();
  const assignment = new AccountAssignmentService(accounts);
  const clock = FakeClock.at('2026-11-12T09:00:00Z');

  const created = await new CreateHouseholdUseCase(households, view).execute(
    'alice',
    { name: 'F', netMonthlyIncomeCents: 350000 },
  );
  const { code } = await new CreateInvitationUseCase(
    households,
    access,
  ).execute('alice');
  const joined = await new JoinHouseholdUseCase(households, view).execute(
    'bob',
    code,
  );
  const commonId = created.spaces.find((s) => s.kind === 'COMMON')!.id;
  const alicePersonalId = created.spaces.find((s) => s.kind === 'PERSONAL')!.id;
  const bobPersonalId = joined.spaces.find((s) => s.kind === 'PERSONAL')!.id;
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

  const setIncome = new SetMyIncomeUseCase(households, access);
  const contribution = new GetContributionUseCase(access, plans, users);
  const addAccount = async (
    id: string,
    spaceId: string,
    archived = false,
  ): Promise<string> => {
    await accounts.save(
      Account.create({
        id,
        spaceId,
        name: id,
        kind: 'CHECKING',
        openingBalanceCents: 0,
        openingDate: '2026-01-01',
        archived,
      }),
    );
    return id;
  };

  return {
    clock,
    transactions,
    commonId,
    alicePersonalId,
    bobPersonalId,
    plans,
    setIncome,
    addAccount,
    setMode: new SetContributionModeUseCase(households, access),
    record: new RecordContributionPaymentUseCase(
      access,
      transactions,
      assignment,
      users,
      clock,
    ),
    status: new GetContributionStatusUseCase(
      new ContributionStatusService(access, contribution, transactions),
      clock,
    ),
    update: new UpdateSpaceTransactionUseCase(access, transactions, assignment),
    remove: new DeleteSpaceTransactionUseCase(access, transactions),
  };
}

describe('RecordContributionPaymentUseCase', () => {
  it('creates a labelled income in the common space with the member and the month', async () => {
    const { record, transactions, commonId } = await setup();
    const result = await record.execute('alice', {
      month: '2026-11',
      amountCents: 120000,
      date: new Date('2026-11-03T10:00:00Z'),
    });

    expect(result.personalTransactionId).toBeNull();
    const income = (await transactions.findById(result.transactionId))!;
    expect(income).toMatchObject({
      spaceId: commonId,
      kind: 'INCOME',
      bloc: null,
      label: 'Contribution de Alice',
      contributionUserId: 'alice',
      contributionMonth: '2026-11',
      accountId: null,
    });
    expect(income.amount.toCents()).toBe(120000);
    expect(income.date.toISOString()).toBe('2026-11-03T10:00:00.000Z');
    expect(transactions.items.size).toBe(1);
  });

  it('defaults the date to now (clock) and may cover a past month or the next one', async () => {
    const { record, transactions, clock } = await setup();
    const a = await record.execute('alice', {
      month: '2026-10',
      amountCents: 100,
    });
    const b = await record.execute('alice', {
      month: '2026-12',
      amountCents: 100,
    });
    expect((await transactions.findById(a.transactionId))!.date).toEqual(
      clock.now(),
    );
    expect(
      (await transactions.findById(b.transactionId))!.contributionMonth,
    ).toBe('2026-12');
  });

  it('also records the personal expense, same amount and date, FIXE by default', async () => {
    const { record, transactions, alicePersonalId, commonId } = await setup();
    const result = await record.execute('alice', {
      month: '2026-11',
      amountCents: 120000,
      date: new Date('2026-11-03T10:00:00Z'),
      debitPersonal: true,
    });
    const expense = (await transactions.findById(
      result.personalTransactionId!,
    ))!;
    expect(expense).toMatchObject({
      spaceId: alicePersonalId,
      kind: 'EXPENSE',
      bloc: 'FIXE',
      label: 'Contribution au foyer',
      contributionUserId: null,
      contributionMonth: null,
    });
    expect(expense.amount.toCents()).toBe(120000);
    expect(expense.date.toISOString()).toBe('2026-11-03T10:00:00.000Z');
    const income = (await transactions.findById(result.transactionId))!;
    expect(income.spaceId).toBe(commonId);
    expect(transactions.items.size).toBe(2);
  });

  it('attaches both operations to their own accounts and honours personalBloc', async () => {
    const { record, transactions, addAccount, commonId, alicePersonalId } =
      await setup();
    const commonAccount = await addAccount('c1', commonId);
    const personalAccount = await addAccount('p1', alicePersonalId);
    const result = await record.execute('alice', {
      month: '2026-11',
      amountCents: 5000,
      accountId: commonAccount,
      debitPersonal: true,
      personalAccountId: personalAccount,
      personalBloc: 'EPARGNE',
    });
    expect((await transactions.findById(result.transactionId))!.accountId).toBe(
      commonAccount,
    );
    const expense = (await transactions.findById(
      result.personalTransactionId!,
    ))!;
    expect(expense.accountId).toBe(personalAccount);
    expect(expense.bloc).toBe('EPARGNE');
  });

  it('keeps no link between the common income and the personal expense', async () => {
    const { record, transactions } = await setup();
    const result = await record.execute('alice', {
      month: '2026-11',
      amountCents: 5000,
      debitPersonal: true,
    });
    const income = (await transactions.findById(result.transactionId))!;
    // Le revenu commun ne porte aucun identifiant du côté personnel.
    expect(JSON.stringify(income)).not.toContain(result.personalTransactionId!);
    expect(income.accountId).toBeNull();
  });

  it('refuses a non-positive or non-integer amount', async () => {
    const { record, transactions } = await setup();
    for (const amountCents of [0, -100, 10.5]) {
      await expect(
        record.execute('alice', { month: '2026-11', amountCents }),
      ).rejects.toThrow(DomainError);
    }
    expect(transactions.items.size).toBe(0);
  });

  it('refuses a month more than one month ahead or malformed', async () => {
    const { record } = await setup();
    await expect(
      record.execute('alice', { month: '2027-01', amountCents: 100 }),
    ).rejects.toThrow(DomainError);
    await expect(
      record.execute('alice', { month: '2026-13', amountCents: 100 }),
    ).rejects.toThrow(DomainError);
  });

  it('refuses a personal account without debitPersonal', async () => {
    const { record, addAccount, alicePersonalId, transactions } = await setup();
    const personalAccount = await addAccount('p1', alicePersonalId);
    await expect(
      record.execute('alice', {
        month: '2026-11',
        amountCents: 100,
        personalAccountId: personalAccount,
      }),
    ).rejects.toThrow(DomainError);
    await expect(
      record.execute('alice', {
        month: '2026-11',
        amountCents: 100,
        debitPersonal: false,
        personalAccountId: personalAccount,
      }),
    ).rejects.toThrow(DomainError);
    expect(transactions.items.size).toBe(0);
  });

  it('refuses unknown, archived or foreign accounts, and writes nothing (all or nothing)', async () => {
    const {
      record,
      addAccount,
      commonId,
      alicePersonalId,
      bobPersonalId,
      transactions,
    } = await setup();
    const archivedCommon = await addAccount('c-arch', commonId, true);
    const archivedPersonal = await addAccount('p-arch', alicePersonalId, true);
    const bobAccount = await addAccount('b1', bobPersonalId);
    const alicePersonal = await addAccount('p1', alicePersonalId);
    const commonAccount = await addAccount('c1', commonId);

    const attempts = [
      { accountId: 'ghost' },
      { accountId: archivedCommon },
      { accountId: alicePersonal },
      { debitPersonal: true, personalAccountId: 'ghost' },
      { debitPersonal: true, personalAccountId: archivedPersonal },
      { debitPersonal: true, personalAccountId: bobAccount },
      { debitPersonal: true, personalAccountId: commonAccount },
      {
        accountId: commonAccount,
        debitPersonal: true,
        personalAccountId: bobAccount,
      },
    ];
    for (const extra of attempts) {
      await expect(
        record.execute('alice', {
          month: '2026-11',
          amountCents: 100,
          ...extra,
        }),
      ).rejects.toThrow(DomainError);
    }
    expect(transactions.items.size).toBe(0);
  });

  it('answers 404 without household', async () => {
    const { record } = await setup();
    await expect(
      record.execute('carol', { month: '2026-11', amountCents: 100 }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('GetContributionStatusUseCase', () => {
  it('is UNKNOWN for everyone while a member has no income', async () => {
    const { status } = await setup();
    const result = await status.execute('alice', '2026-11');
    expect(result).toMatchObject({
      month: '2026-11',
      incomplete: true,
      totalExpectedCents: null,
      totalPaidCents: 0,
    });
    expect(result.members).toHaveLength(2);
    for (const member of result.members) {
      expect(member).toMatchObject({
        expectedCents: null,
        remainingCents: null,
        status: 'UNKNOWN',
        paidCents: 0,
      });
    }
  });

  it('defaults to the current month and exposes isMe from the caller point of view', async () => {
    const { status, setIncome } = await setup();
    await setIncome.execute('bob', 200000);
    const asAlice = await status.execute('alice');
    expect(asAlice.month).toBe('2026-11');
    expect(asAlice.members.filter((m) => m.isMe).map((m) => m.userId)).toEqual([
      'alice',
    ]);
    const asBob = await status.execute('bob');
    expect(asBob.members.filter((m) => m.isMe).map((m) => m.userId)).toEqual([
      'bob',
    ]);
  });

  it('reuses the household rule and sums what each member paid for the month', async () => {
    const { status, setIncome, setMode, record } = await setup();
    await setIncome.execute('bob', 200000);
    await setMode.execute('alice', 'PROPORTIONAL');
    // Besoin 330 000 c ; revenus 350 000 + 200 000 : parts 210 000 et 120 000.
    await record.execute('alice', { month: '2026-11', amountCents: 100000 });
    await record.execute('alice', { month: '2026-11', amountCents: 20000 });
    await record.execute('alice', { month: '2026-10', amountCents: 999 });
    await record.execute('bob', { month: '2026-11', amountCents: 120100 });

    const result = await status.execute('alice', '2026-11');
    expect(result.incomplete).toBe(false);
    expect(result.members).toEqual([
      {
        userId: 'alice',
        name: 'Alice Martin',
        expectedCents: 210000,
        paidCents: 120000,
        remainingCents: 90000,
        status: 'PARTIAL',
        isMe: true,
      },
      {
        userId: 'bob',
        name: 'Bob',
        expectedCents: 120000,
        paidCents: 120100,
        remainingCents: 0,
        status: 'PAID',
        isMe: false,
      },
    ]);
    expect(result.totalExpectedCents).toBe(330000);
    expect(result.totalPaidCents).toBe(240100);
  });

  it('covers PENDING, PAID, OVERPAID and NONE', async () => {
    const { status, setIncome, record, plans, commonId } = await setup();
    await setIncome.execute('bob', 200000);
    const state = async (user: string, month = '2026-11') =>
      (await status.execute('alice', month)).members.find(
        (m) => m.userId === user,
      )!;
    expect((await state('bob')).status).toBe('PENDING');

    const bobExpected = (await state('bob')).expectedCents!;
    await record.execute('bob', { month: '2026-11', amountCents: bobExpected });
    expect((await state('bob')).status).toBe('PAID');
    await record.execute('bob', { month: '2026-11', amountCents: 101 });
    expect((await state('bob')).status).toBe('OVERPAID');

    plans.plans.set(commonId, SpacePlan.empty());
    expect((await state('bob')).status).toBe('NONE');
  });

  it('recomputes when a contribution is edited or deleted through the ordinary routes', async () => {
    const { status, setIncome, record, update, remove, commonId } =
      await setup();
    await setIncome.execute('bob', 200000);
    const { transactionId } = await record.execute('alice', {
      month: '2026-11',
      amountCents: 100000,
    });
    const paid = async () =>
      (await status.execute('alice', '2026-11')).members[0].paidCents;
    expect(await paid()).toBe(100000);

    await update.execute('alice', commonId, transactionId, {
      kind: 'INCOME',
      label: 'Contribution de Alice',
      amountCents: 150000,
      date: new Date('2026-12-20T10:00:00Z'),
    });
    // Le mois couvert est conservé même si la date de l'opération change.
    expect(await paid()).toBe(150000);

    // Un revenu devenu dépense n'est plus une contribution.
    await update.execute('alice', commonId, transactionId, {
      kind: 'EXPENSE',
      bloc: 'COURANT',
      label: 'Autre chose',
      amountCents: 150000,
    });
    expect(await paid()).toBe(0);

    const second = await record.execute('alice', {
      month: '2026-11',
      amountCents: 70000,
    });
    expect(await paid()).toBe(70000);
    await remove.execute('alice', commonId, second.transactionId);
    expect(await paid()).toBe(0);
  });

  it('answers 404 without household and 400 on a malformed month', async () => {
    const { status } = await setup();
    await expect(status.execute('carol', '2026-11')).rejects.toThrow(
      NotFoundException,
    );
    await expect(status.execute('alice', '2026-13')).rejects.toThrow(
      DomainError,
    );
  });
});
