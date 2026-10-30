import { NotFoundException } from '@nestjs/common';
import { DomainError } from '../../domain/shared/domain-error';
import { User } from '../../domain/user/user';
import { FakeClock } from '../../testing/fake-clock';
import {
  InMemoryAccountRepository,
  InMemoryFiscalProfileRepository,
  InMemoryHouseholdRepository,
  InMemoryMonthReviewRepository,
  InMemoryProjectRepository,
  InMemoryRecurringItemRepository,
  InMemorySafetyNetRepository,
  InMemorySpacePlanRepository,
  InMemoryTransactionRepository,
  InMemoryUserRepository,
} from '../../testing/in-memory-repositories';
import { AccountAssignmentService } from '../account/account-assignment.service';
import { CreateAccountUseCase } from '../account/account.use-cases';
import {
  ExportDataUseCase,
  ExportTransactionsCsvUseCase,
} from '../export/export.use-cases';
import { CreateHouseholdUseCase } from '../household/create-household.use-case';
import { CreateInvitationUseCase } from '../household/create-invitation.use-case';
import { HouseholdViewBuilder } from '../household/household.dto';
import { JoinHouseholdUseCase } from '../household/join-household.use-case';
import { SpaceAccessService } from '../household/space-access.service';
import { CreateRecurringItemUseCase } from '../recurring/recurring.use-cases';
import { SaveSpacePlanUseCase } from '../space/space-plan.use-cases';
import { CreateSpaceTransactionUseCase } from '../space/space-transaction.use-cases';
import {
  GetReviewUseCase,
  ListReviewsUseCase,
  SaveReviewUseCase,
} from './review.use-cases';

async function setup() {
  const households = new InMemoryHouseholdRepository();
  const users = new InMemoryUserRepository();
  for (const id of ['alice', 'bob', 'loner']) {
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
  const recurring = new InMemoryRecurringItemRepository();
  const accounts = new InMemoryAccountRepository();
  const projects = new InMemoryProjectRepository();
  const reviews = new InMemoryMonthReviewRepository();
  const safetyNets = new InMemorySafetyNetRepository();
  const fiscal = new InMemoryFiscalProfileRepository();
  const clock = FakeClock.at('2026-11-12T09:00:00Z');
  const assignment = new AccountAssignmentService(accounts);

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
    clock,
    reviews,
    commonId: created.spaces.find((s) => s.kind === 'COMMON')!.id,
    alicePersonalId: created.spaces.find((s) => s.kind === 'PERSONAL')!.id,
    bobPersonalId: households.spaces.find((s) => s.ownerUserId === 'bob')!.id,
    get: new GetReviewUseCase(
      access,
      reviews,
      plans,
      transactions,
      recurring,
      accounts,
      clock,
    ),
    save: new SaveReviewUseCase(access, reviews, clock),
    list: new ListReviewsUseCase(access, reviews),
    savePlan: new SaveSpacePlanUseCase(access, plans),
    createTx: new CreateSpaceTransactionUseCase(
      access,
      transactions,
      assignment,
    ),
    createRec: new CreateRecurringItemUseCase(access, recurring, assignment),
    createAccount: new CreateAccountUseCase(access, accounts),
    exportData: new ExportDataUseCase(
      access,
      view,
      plans,
      transactions,
      recurring,
      accounts,
      projects,
      reviews,
      safetyNets,
      fiscal,
      clock,
    ),
    exportCsv: new ExportTransactionsCsvUseCase(access, transactions, accounts),
  };
}

const answers = (decision = '', wentWell = '', surprise = '') => ({
  wentWell,
  surprise,
  decision,
});

describe('review use cases', () => {
  it('starts as TODO with a recomputed snapshot, then follows the saved answers', async () => {
    const s = await setup();
    await s.savePlan.execute('alice', s.commonId, {
      incomeCents: 380000,
      fixeCents: 175000,
      courantCents: 100000,
      plaisirCents: 45000,
      epargneCents: 20000,
    });
    await s.createTx.execute('alice', s.commonId, {
      kind: 'INCOME',
      label: 'Salaire',
      amountCents: 380000,
      date: new Date('2026-10-28T00:00:00Z'),
    });
    await s.createTx.execute('alice', s.commonId, {
      kind: 'EXPENSE',
      bloc: 'FIXE',
      label: 'Loyer',
      amountCents: 171000,
      date: new Date('2026-10-05T00:00:00Z'),
    });
    await s.createRec.execute('alice', s.commonId, {
      kind: 'EXPENSE',
      bloc: 'FIXE',
      label: 'Assurance',
      amountCents: 5000,
      dayOfMonth: 8,
      startDate: '2026-01-01',
      endDate: null,
      active: true,
    });

    const todo = await s.get.execute('bob', s.commonId, '2026-10');
    expect(todo).toMatchObject({
      month: '2026-10',
      status: 'TODO',
      completedAt: null,
      answers: answers(),
    });
    expect(todo.snapshot).toMatchObject({
      incomeCents: 380000,
      expenseCents: 171000,
      balanceCents: 209000,
      savingsRatePercent: 55, // 54,99
      missingRecurring: [{ label: 'Assurance', amountCents: 5000 }],
      unassignedTransactionCount: 0,
    });
    expect(todo.snapshot.blocs[0]).toEqual({
      bloc: 'FIXE',
      plannedCents: 175000,
      actualCents: 171000,
      deltaCents: -4000,
    });

    await s.save.execute('bob', s.commonId, '2026-10', {
      answers: answers('', 'Épargne tenue'),
      complete: false,
    });
    expect((await s.get.execute('alice', s.commonId, '2026-10')).status).toBe(
      'DRAFT',
    );
    await s.save.execute('alice', s.commonId, '2026-10', {
      answers: answers('Cuisiner plus', 'Épargne tenue', 'Courses'),
      complete: true,
    });
    const done = await s.get.execute('bob', s.commonId, '2026-10');
    expect(done).toMatchObject({
      status: 'DONE',
      completedAt: '2026-11-12T09:00:00.000Z',
      answers: answers('Cuisiner plus', 'Épargne tenue', 'Courses'),
    });
    // Le snapshot suit les opérations : rien n'est figé.
    await s.createTx.execute('alice', s.commonId, {
      kind: 'EXPENSE',
      bloc: 'COURANT',
      label: 'Courses',
      amountCents: 1000,
      date: new Date('2026-10-20T00:00:00Z'),
    });
    expect(
      (await s.get.execute('bob', s.commonId, '2026-10')).snapshot.expenseCents,
    ).toBe(172000);
  });

  it('refuses a future month on read and on write, accepts the current one', async () => {
    const s = await setup();
    await expect(
      s.get.execute('alice', s.commonId, '2026-12'),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      s.save.execute('alice', s.commonId, '2026-12', {
        answers: answers('x'),
        complete: false,
      }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      s.get.execute('alice', s.commonId, '2026-11'),
    ).resolves.toBeDefined();
    await expect(
      s.get.execute('alice', s.commonId, '2026-13'),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      s.get.execute('alice', s.commonId, '2020-01'),
    ).resolves.toMatchObject({ status: 'TODO' });
  });

  it('refuses to complete without a decision and keeps the first completion date', async () => {
    const s = await setup();
    await expect(
      s.save.execute('alice', s.commonId, '2026-10', {
        answers: answers('', 'Bien'),
        complete: true,
      }),
    ).rejects.toThrow(/décision/);
    await s.save.execute('alice', s.commonId, '2026-10', {
      answers: answers('A'),
      complete: true,
    });
    s.clock.set('2026-11-20T09:00:00Z');
    await s.save.execute('alice', s.commonId, '2026-10', {
      answers: answers('B'),
      complete: true,
    });
    const review = await s.get.execute('alice', s.commonId, '2026-10');
    expect(review).toMatchObject({
      status: 'DONE',
      completedAt: '2026-11-12T09:00:00.000Z',
      answers: answers('B'),
    });
  });

  it('falls back to TODO (and stores nothing) when everything is erased', async () => {
    const s = await setup();
    await s.save.execute('alice', s.commonId, '2026-10', {
      answers: answers('A'),
      complete: false,
    });
    expect(s.reviews.items.size).toBe(1);
    await s.save.execute('alice', s.commonId, '2026-10', {
      answers: answers(),
      complete: false,
    });
    expect(s.reviews.items.size).toBe(0);
    expect((await s.get.execute('alice', s.commonId, '2026-10')).status).toBe(
      'TODO',
    );
  });

  it('lists non-TODO reviews, newest first, with a limit', async () => {
    const s = await setup();
    for (const [month, decision, complete] of [
      ['2026-08', 'Août', true],
      ['2026-09', 'Sept', true],
      ['2026-10', '', false],
    ] as const) {
      await s.save.execute('alice', s.commonId, month, {
        answers: answers(decision, 'x'),
        complete,
      });
    }
    const all = await s.list.execute('bob', s.commonId);
    expect(all.map((r) => [r.month, r.status, r.decision])).toEqual([
      ['2026-10', 'DRAFT', ''],
      ['2026-09', 'DONE', 'Sept'],
      ['2026-08', 'DONE', 'Août'],
    ]);
    expect(all[1].completedAt).toBe('2026-11-12T09:00:00.000Z');
    expect(all[0].completedAt).toBeNull();
    expect(await s.list.execute('bob', s.commonId, 2)).toHaveLength(2);
  });

  it('keeps one review per space: the common and personal reviews are independent', async () => {
    const s = await setup();
    await s.save.execute('alice', s.commonId, '2026-10', {
      answers: answers('Commun'),
      complete: true,
    });
    await s.save.execute('alice', s.alicePersonalId, '2026-10', {
      answers: answers('Perso'),
      complete: false,
    });
    expect(
      (await s.get.execute('alice', s.commonId, '2026-10')).answers.decision,
    ).toBe('Commun');
    expect(
      (await s.get.execute('alice', s.alicePersonalId, '2026-10')).answers
        .decision,
    ).toBe('Perso');
    expect(await s.list.execute('bob', s.bobPersonalId)).toEqual([]);
  });

  it('hides the personal reviews of another member on every use case', async () => {
    const s = await setup();
    await s.save.execute('alice', s.alicePersonalId, '2026-10', {
      answers: answers('Secret'),
      complete: true,
    });
    const id = s.alicePersonalId;
    for (const attempt of [
      s.get.execute('bob', id, '2026-10'),
      s.save.execute('bob', id, '2026-10', {
        answers: answers('Intrus'),
        complete: true,
      }),
      s.list.execute('bob', id),
    ]) {
      await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
    }
    expect((await s.get.execute('alice', id, '2026-10')).answers.decision).toBe(
      'Secret',
    );
  });
});

describe('data export', () => {
  it('exports the household, the common space and ONLY the user personal space', async () => {
    const s = await setup();
    const aliceAccount = await s.createAccount.execute(
      'alice',
      s.alicePersonalId,
      {
        name: 'Cagnotte Alice',
        kind: 'CHECKING',
        openingBalanceCents: 1000,
        openingDate: '2026-01-01',
      },
    );
    await s.createTx.execute('alice', s.alicePersonalId, {
      kind: 'EXPENSE',
      bloc: 'PLAISIR',
      label: 'Cadeau secret',
      amountCents: 4200,
      date: new Date('2026-10-12T00:00:00Z'),
      accountId: aliceAccount.id,
    });
    await s.createTx.execute('bob', s.bobPersonalId, {
      kind: 'EXPENSE',
      bloc: 'PLAISIR',
      label: 'Cadeau de Bob',
      amountCents: 999,
      date: new Date('2026-10-13T00:00:00Z'),
    });
    await s.createTx.execute('alice', s.commonId, {
      kind: 'INCOME',
      label: 'Salaire',
      amountCents: 380000,
      date: new Date('2026-10-28T00:00:00Z'),
    });
    await s.save.execute('alice', s.alicePersonalId, '2026-10', {
      answers: answers('Décision privée'),
      complete: true,
    });

    const alice = await s.exportData.execute('alice');
    expect(alice.filename).toBe('budget-export-2026-11-12.json');
    const data = alice.data as {
      version: number;
      exportedAt: string;
      spaces: {
        space: { kind: string; id: string };
        transactions: { label: string }[];
        accounts: { name: string }[];
        reviews: { answers: { decision: string } }[];
      }[];
      safetyNet: unknown;
      fiscalProfile: unknown;
    };
    expect(data).toMatchObject({
      version: 1,
      exportedAt: '2026-11-12T09:00:00.000Z',
      safetyNet: null,
      fiscalProfile: null,
    });
    expect(data.spaces.map((x) => x.space.kind)).toEqual([
      'COMMON',
      'PERSONAL',
    ]);
    const json = JSON.stringify(data);
    expect(json).toContain('Cadeau secret');
    expect(json).toContain('Décision privée');
    expect(json).toContain('Cagnotte Alice');
    expect(json).not.toContain('Cadeau de Bob');
    expect(data.spaces[0].transactions.map((t) => t.label)).toEqual([
      'Salaire',
    ]);

    const bob = JSON.stringify((await s.exportData.execute('bob')).data);
    expect(bob).toContain('Cadeau de Bob');
    for (const secret of [
      'Cadeau secret',
      'Décision privée',
      'Cagnotte Alice',
    ]) {
      expect(bob).not.toContain(secret);
    }
  });

  it('answers 404 for a user without household', async () => {
    const s = await setup();
    await expect(s.exportData.execute('loner')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('exports a CSV of the period, sorted by date, with account names', async () => {
    const s = await setup();
    const account = await s.createAccount.execute('alice', s.commonId, {
      name: 'Compte commun',
      kind: 'CHECKING',
      openingBalanceCents: 0,
      openingDate: '2026-01-01',
    });
    await s.createTx.execute('alice', s.commonId, {
      kind: 'EXPENSE',
      bloc: 'COURANT',
      label: 'Courses',
      amountCents: 14230,
      date: new Date('2026-10-03T10:00:00Z'),
      accountId: account.id,
    });
    await s.createTx.execute('alice', s.commonId, {
      kind: 'EXPENSE',
      bloc: 'FIXE',
      label: '=1+1',
      amountCents: 100,
      date: new Date('2026-10-01T23:59:00Z'),
    });
    await s.createTx.execute('alice', s.commonId, {
      kind: 'INCOME',
      label: 'Hors période',
      amountCents: 5,
      date: new Date('2026-11-01T00:00:00Z'),
    });
    const csv = await s.exportCsv.execute(
      'bob',
      s.commonId,
      '2026-10-01',
      '2026-10-31',
    );
    expect(csv.filename).toBe('operations-2026-10-01_2026-10-31.csv');
    expect(csv.content.slice(1).split('\r\n')).toEqual([
      'Date;Type;Bloc;Libellé;Montant;Compte',
      "2026-10-01;Dépense;Fixe;'=1+1;1,00;",
      '2026-10-03;Dépense;Courant;Courses;142,30;Compte commun',
      '',
    ]);
    // Limites incluses : le 1er novembre à minuit est dedans pour to = 2026-11-01.
    const wider = await s.exportCsv.execute(
      'bob',
      s.commonId,
      '2026-10-31',
      '2026-11-01',
    );
    expect(wider.content).toContain('Hors période');
  });

  it('limits the period to 366 days (boundary included)', async () => {
    const s = await setup();
    const run = (from: string, to: string) =>
      s.exportCsv.execute('alice', s.commonId, from, to);
    await expect(run('2026-01-01', '2026-12-31')).resolves.toBeDefined(); // 365 jours
    await expect(run('2026-01-01', '2027-01-01')).resolves.toBeDefined(); // 366 jours
    await expect(run('2026-01-01', '2027-01-02')).rejects.toThrow(/366/); // 367 jours
    await expect(run('2028-01-01', '2028-12-31')).resolves.toBeDefined(); // année bissextile : 366
    await expect(run('2028-01-01', '2029-01-01')).rejects.toBeInstanceOf(
      DomainError,
    ); // 367
  });

  it('refuses an inverted or impossible period and hides personal spaces', async () => {
    const s = await setup();
    await expect(
      s.exportCsv.execute('alice', s.commonId, '2026-10-31', '2026-10-01'),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      s.exportCsv.execute('alice', s.commonId, '2026-02-30', '2026-03-01'),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      s.exportCsv.execute('bob', s.alicePersonalId, '2026-10-01', '2026-10-31'),
    ).rejects.toBeInstanceOf(NotFoundException);
    const same = await s.exportCsv.execute(
      'alice',
      s.commonId,
      '2026-10-01',
      '2026-10-01',
    );
    expect(same.content).toBe('﻿Date;Type;Bloc;Libellé;Montant;Compte\r\n');
  });
});
