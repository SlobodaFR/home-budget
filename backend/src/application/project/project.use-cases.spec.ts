import { NotFoundException } from '@nestjs/common';
import { DomainError } from '../../domain/shared/domain-error';
import { User } from '../../domain/user/user';
import { FakeClock } from '../../testing/fake-clock';
import {
  InMemoryAccountRepository,
  InMemoryHouseholdRepository,
  InMemoryProjectRepository,
  InMemoryRecurringItemRepository,
  InMemorySpacePlanRepository,
  InMemoryTransactionRepository,
  InMemoryUserRepository,
} from '../../testing/in-memory-repositories';
import { AccountAssignmentService } from '../account/account-assignment.service';
import {
  CreateAccountUseCase,
  DeleteAccountUseCase,
  UpdateAccountUseCase,
} from '../account/account.use-cases';
import { CreateHouseholdUseCase } from '../household/create-household.use-case';
import { CreateInvitationUseCase } from '../household/create-invitation.use-case';
import { HouseholdViewBuilder } from '../household/household.dto';
import { JoinHouseholdUseCase } from '../household/join-household.use-case';
import { SpaceAccessService } from '../household/space-access.service';
import { SaveSpacePlanUseCase } from '../space/space-plan.use-cases';
import {
  AddDepositUseCase,
  CreateProjectUseCase,
  DeleteDepositUseCase,
  DeleteProjectUseCase,
  GetProjectsSummaryUseCase,
  ListDepositsUseCase,
  ListProjectsUseCase,
  SaveProjectCommand,
  UpdateProjectUseCase,
} from './project.use-cases';
import { ProjectViewsService } from './project-views.service';

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
  const projects = new InMemoryProjectRepository();
  const accounts = new InMemoryAccountRepository();
  const plans = new InMemorySpacePlanRepository();
  const clock = FakeClock.at('2026-11-12T09:00:00Z');
  const assignment = new AccountAssignmentService(accounts);
  const views = new ProjectViewsService(projects, clock);

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
    projects,
    commonId: created.spaces.find((s) => s.kind === 'COMMON')!.id,
    alicePersonalId: created.spaces.find((s) => s.kind === 'PERSONAL')!.id,
    bobPersonalId: households.spaces.find((s) => s.ownerUserId === 'bob')!.id,
    list: new ListProjectsUseCase(access, views),
    summary: new GetProjectsSummaryUseCase(access, views, plans),
    create: new CreateProjectUseCase(access, projects, assignment, clock),
    update: new UpdateProjectUseCase(access, projects, assignment),
    remove: new DeleteProjectUseCase(access, projects),
    deposits: new ListDepositsUseCase(access, projects),
    deposit: new AddDepositUseCase(access, projects),
    removeDeposit: new DeleteDepositUseCase(access, projects),
    savePlan: new SaveSpacePlanUseCase(access, plans),
    createAccount: new CreateAccountUseCase(access, accounts),
    updateAccount: new UpdateAccountUseCase(access, accounts),
    removeAccount: new DeleteAccountUseCase(
      access,
      accounts,
      new InMemoryTransactionRepository(),
      new InMemoryRecurringItemRepository(),
      projects,
    ),
  };
}

const vacances: SaveProjectCommand = {
  name: 'Vacances été 2027',
  kind: 'HOLIDAY',
  targetCents: 300000,
  targetDate: '2027-07-01',
  startCents: 0,
  startDate: '2026-11-01',
};

const livret = {
  name: 'Livret',
  kind: 'SAVINGS' as const,
  openingBalanceCents: 0,
  openingDate: '2026-01-01',
};

describe('project use cases', () => {
  it('creates, lists, updates and deletes a project', async () => {
    const s = await setup();
    const created = await s.create.execute('alice', s.commonId, vacances);
    expect(created).toEqual({
      id: expect.any(String),
      spaceId: s.commonId,
      name: 'Vacances été 2027',
      kind: 'HOLIDAY',
      targetCents: 300000,
      targetDate: '2027-07-01',
      startCents: 0,
      startDate: '2026-11-01',
      savedCents: 0,
      remainingCents: 300000,
      progressPercent: 0,
      monthsLeft: 7, // 12 novembre -> 1er juillet
      monthlyNeededCents: 42858, // 300 000 / 7 arrondi au supérieur
      status: 'ON_TRACK', // 11 jours : attendu 13 636, retard < 5 % (15 000)
      expectedSavedCents: 13636,
      archived: false,
      accountId: null,
    });
    expect(await s.list.execute('bob', s.commonId)).toEqual([created]);

    await s.update.execute('bob', s.commonId, created.id, {
      ...vacances,
      name: 'Vacances',
      targetCents: 200000,
      startCents: 10000,
    });
    expect((await s.list.execute('alice', s.commonId))[0]).toMatchObject({
      name: 'Vacances',
      targetCents: 200000,
      startCents: 10000,
      savedCents: 10000,
    });
    await s.remove.execute('alice', s.commonId, created.id);
    expect(await s.list.execute('alice', s.commonId)).toEqual([]);
  });

  it('refuses invalid projects with a domain error', async () => {
    const s = await setup();
    for (const bad of [
      { name: '' },
      { name: 'x'.repeat(81) },
      { kind: 'AUTRE' as never },
      { targetCents: 0 },
      { startCents: -1 },
      { targetDate: '2026-11-01' },
      { targetDate: '2026-10-01' },
      { startDate: '2026-02-30' },
    ]) {
      await expect(
        s.create.execute('alice', s.commonId, { ...vacances, ...bad }),
      ).rejects.toBeInstanceOf(DomainError);
    }
  });

  it('lists active projects by target date, archived ones last, and archives on update', async () => {
    const s = await setup();
    const far = await s.create.execute('alice', s.commonId, {
      ...vacances,
      name: 'Voiture',
      targetDate: '2028-01-01',
    });
    const near = await s.create.execute('alice', s.commonId, {
      ...vacances,
      name: 'Naissance',
      targetDate: '2027-02-01',
    });
    expect(
      (await s.list.execute('alice', s.commonId)).map((p) => p.name),
    ).toEqual(['Naissance', 'Voiture']);
    await s.update.execute('alice', s.commonId, near.id, {
      ...vacances,
      name: 'Naissance',
      targetDate: '2027-02-01',
      archived: true,
    });
    expect(
      (await s.list.execute('alice', s.commonId)).map((p) => [
        p.name,
        p.archived,
      ]),
    ).toEqual([
      ['Voiture', false],
      ['Naissance', true],
    ]);
    // `archived` absent : inchangé.
    await s.update.execute('alice', s.commonId, near.id, {
      ...vacances,
      name: 'Naissance',
      targetDate: '2027-02-01',
    });
    expect((await s.list.execute('alice', s.commonId))[1].archived).toBe(true);
    expect(far.archived).toBe(false);
  });

  it('answers 404 for a project of another space or an unknown one', async () => {
    const s = await setup();
    const mine = await s.create.execute('alice', s.alicePersonalId, vacances);
    for (const attempt of [
      s.update.execute('alice', s.commonId, mine.id, vacances),
      s.remove.execute('alice', s.commonId, mine.id),
      s.deposits.execute('alice', s.commonId, mine.id),
      s.deposit.execute('alice', s.commonId, mine.id, {
        date: '2026-11-02',
        amountCents: 100,
      }),
      s.remove.execute('alice', s.commonId, 'nope'),
    ]) {
      await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
    }
  });
});

describe('deposits', () => {
  it('adds deposits and withdrawals, lists them newest first and updates the progress', async () => {
    const s = await setup();
    const project = await s.create.execute('alice', s.commonId, {
      ...vacances,
      startCents: 20000,
    });
    const first = await s.deposit.execute('alice', s.commonId, project.id, {
      date: '2026-11-02',
      amountCents: 30000,
      note: '  Prime  ',
    });
    expect(first).toEqual({
      id: expect.any(String),
      date: '2026-11-02',
      amountCents: 30000,
      note: 'Prime',
    });
    await s.deposit.execute('bob', s.commonId, project.id, {
      date: '2026-11-10',
      amountCents: -5000,
    });
    await s.deposit.execute('bob', s.commonId, project.id, {
      date: '2026-11-10',
      amountCents: 1000,
      note: null,
    });
    await s.deposit.execute('bob', s.commonId, project.id, {
      date: '2026-10-30',
      amountCents: 500,
    });
    const listed = await s.deposits.execute('alice', s.commonId, project.id);
    expect(listed.map((d) => [d.date, d.amountCents])).toHaveLength(4);
    expect(listed.map((d) => d.date)).toEqual([
      '2026-11-10',
      '2026-11-10',
      '2026-11-02',
      '2026-10-30',
    ]);
    expect(listed.every((d) => typeof d.note === 'string')).toBe(true);
    // 20 000 + 30 000 − 5 000 + 1 000 + 500
    expect((await s.list.execute('alice', s.commonId))[0].savedCents).toBe(
      46500,
    );
  });

  it('refuses a withdrawal that would make the savings negative, boundary included', async () => {
    const s = await setup();
    const project = await s.create.execute('alice', s.commonId, {
      ...vacances,
      startCents: 10000,
    });
    await s.deposit.execute('alice', s.commonId, project.id, {
      date: '2026-11-02',
      amountCents: 5000,
    });
    // 15 000 épargnés : retirer 15 001 est refusé, 15 000 est permis (solde nul).
    await expect(
      s.deposit.execute('alice', s.commonId, project.id, {
        date: '2026-11-03',
        amountCents: -15001,
      }),
    ).rejects.toThrow(/négative/);
    await expect(
      s.deposit.execute('alice', s.commonId, project.id, {
        date: '2026-11-03',
        amountCents: -15000,
      }),
    ).resolves.toBeDefined();
    expect((await s.list.execute('alice', s.commonId))[0].savedCents).toBe(0);
    await expect(
      s.deposit.execute('alice', s.commonId, project.id, {
        date: '2026-11-04',
        amountCents: -1,
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('validates the amount, the date and the note', async () => {
    const s = await setup();
    const project = await s.create.execute('alice', s.commonId, vacances);
    for (const bad of [
      { date: '2026-11-02', amountCents: 0 },
      { date: '2026-11-02', amountCents: 10.5 },
      { date: '2026-02-30', amountCents: 100 },
      { date: '2026-11-02', amountCents: 100, note: 'x'.repeat(121) },
    ]) {
      await expect(
        s.deposit.execute('alice', s.commonId, project.id, bad),
      ).rejects.toBeInstanceOf(DomainError);
    }
    await expect(
      s.deposit.execute('alice', s.commonId, project.id, {
        date: '2026-11-02',
        amountCents: 100,
        note: 'x'.repeat(120),
      }),
    ).resolves.toBeDefined();
  });

  it('deletes a deposit, unless a later withdrawal depends on it', async () => {
    const s = await setup();
    const project = await s.create.execute('alice', s.commonId, vacances);
    const big = await s.deposit.execute('alice', s.commonId, project.id, {
      date: '2026-11-02',
      amountCents: 10000,
    });
    const small = await s.deposit.execute('alice', s.commonId, project.id, {
      date: '2026-11-03',
      amountCents: 2000,
    });
    await s.deposit.execute('alice', s.commonId, project.id, {
      date: '2026-11-04',
      amountCents: -9000,
    });
    await expect(
      s.removeDeposit.execute('alice', s.commonId, project.id, big.id),
    ).rejects.toThrow(/négative/);
    await s.removeDeposit.execute('alice', s.commonId, project.id, small.id);
    expect((await s.list.execute('alice', s.commonId))[0].savedCents).toBe(
      1000,
    );
    await expect(
      s.removeDeposit.execute('alice', s.commonId, project.id, small.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    const other = await s.create.execute('alice', s.commonId, {
      ...vacances,
      name: 'Autre',
    });
    await expect(
      s.removeDeposit.execute('alice', s.commonId, other.id, big.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to lower the start amount below what the withdrawals allow', async () => {
    const s = await setup();
    const project = await s.create.execute('alice', s.commonId, {
      ...vacances,
      startCents: 10000,
    });
    await s.deposit.execute('alice', s.commonId, project.id, {
      date: '2026-11-02',
      amountCents: -8000,
    });
    await expect(
      s.update.execute('alice', s.commonId, project.id, {
        ...vacances,
        startCents: 7999,
      }),
    ).rejects.toThrow(/négative/);
    await expect(
      s.update.execute('alice', s.commonId, project.id, {
        ...vacances,
        startCents: 8000,
      }),
    ).resolves.toBeUndefined();
  });

  it('removes the deposits together with the project', async () => {
    const s = await setup();
    const project = await s.create.execute('alice', s.commonId, vacances);
    const keep = await s.create.execute('alice', s.commonId, {
      ...vacances,
      name: 'Autre',
    });
    await s.deposit.execute('alice', s.commonId, project.id, {
      date: '2026-11-02',
      amountCents: 100,
    });
    await s.deposit.execute('alice', s.commonId, keep.id, {
      date: '2026-11-02',
      amountCents: 200,
    });
    await s.remove.execute('alice', s.commonId, project.id);
    expect(s.projects.deposits.size).toBe(1);
    expect(
      (await s.deposits.execute('alice', s.commonId, keep.id)).map(
        (d) => d.amountCents,
      ),
    ).toEqual([200]);
  });
});

describe('summary', () => {
  it('compares the monthly need of active projects with the planned savings', async () => {
    const s = await setup(); // 12 novembre 2026
    await s.savePlan.execute('alice', s.commonId, {
      incomeCents: 0,
      fixeCents: 0,
      courantCents: 0,
      plaisirCents: 0,
      epargneCents: 50000,
    });
    const a = await s.create.execute('alice', s.commonId, vacances); // 42 858 / mois
    await s.create.execute('alice', s.commonId, {
      ...vacances,
      name: 'Naissance',
      targetCents: 100000,
      targetDate: '2027-03-01',
    }); // 12 nov. -> 1er mars : 3 mois entiers, 33 334
    const archived = await s.create.execute('alice', s.commonId, {
      ...vacances,
      name: 'Ancien',
    });
    await s.update.execute('alice', s.commonId, archived.id, {
      ...vacances,
      name: 'Ancien',
      archived: true,
    });
    const done = await s.create.execute('alice', s.commonId, {
      ...vacances,
      name: 'Fini',
      targetCents: 1000,
    });
    await s.deposit.execute('alice', s.commonId, done.id, {
      date: '2026-11-02',
      amountCents: 1000,
    });
    expect(await s.summary.execute('bob', s.commonId)).toEqual({
      totalMonthlyNeededCents: 42858 + 33334,
      plannedEpargneCents: 50000,
      gapCents: 42858 + 33334 - 50000,
      activeCount: 2,
    });
    await s.deposit.execute('alice', s.commonId, a.id, {
      date: '2026-11-05',
      amountCents: 300000,
    });
    expect((await s.summary.execute('bob', s.commonId)).activeCount).toBe(1);
  });

  it('is zero without projects or plan', async () => {
    const s = await setup();
    expect(await s.summary.execute('alice', s.commonId)).toEqual({
      totalMonthlyNeededCents: 0,
      plannedEpargneCents: 0,
      gapCents: 0,
      activeCount: 0,
    });
  });
});

describe('accounts', () => {
  it('validates the account like for operations: same space, not archived', async () => {
    const s = await setup();
    const common = await s.createAccount.execute('alice', s.commonId, livret);
    const personal = await s.createAccount.execute(
      'alice',
      s.alicePersonalId,
      livret,
    );
    const old = await s.createAccount.execute('alice', s.commonId, {
      ...livret,
      name: 'Ancien',
    });
    await s.updateAccount.execute('alice', s.commonId, old.id, {
      ...livret,
      name: 'Ancien',
      archived: true,
    });

    const created = await s.create.execute('alice', s.commonId, {
      ...vacances,
      accountId: common.id,
    });
    expect(created.accountId).toBe(common.id);
    for (const id of ['nope', personal.id, old.id]) {
      await expect(
        s.create.execute('alice', s.commonId, { ...vacances, accountId: id }),
      ).rejects.toBeInstanceOf(DomainError);
    }
    await expect(
      s.create.execute('alice', s.alicePersonalId, {
        ...vacances,
        accountId: common.id,
      }),
    ).rejects.toThrow(/n'existe pas dans cet espace/);
    // Détacher, puis rattacher à un compte archivé : refusé ; le conserver tel quel : permis.
    await s.update.execute('alice', s.commonId, created.id, {
      ...vacances,
      accountId: null,
    });
    await expect(
      s.update.execute('alice', s.commonId, created.id, {
        ...vacances,
        accountId: old.id,
      }),
    ).rejects.toThrow(/archivé/);
  });

  it('keeps an account that a project uses from being deleted', async () => {
    const s = await setup();
    const account = await s.createAccount.execute('alice', s.commonId, livret);
    const project = await s.create.execute('alice', s.commonId, {
      ...vacances,
      accountId: account.id,
    });
    await expect(
      s.removeAccount.execute('alice', s.commonId, account.id),
    ).rejects.toThrow(/archivez-le/);
    await s.update.execute('alice', s.commonId, project.id, {
      ...vacances,
      accountId: null,
    });
    await expect(
      s.removeAccount.execute('alice', s.commonId, account.id),
    ).resolves.toBeUndefined();
  });
});

describe('isolation of personal projects', () => {
  it('hides the projects and deposits of another member on every use case', async () => {
    const s = await setup();
    const mine = await s.create.execute('alice', s.alicePersonalId, vacances);
    const deposit = await s.deposit.execute(
      'alice',
      s.alicePersonalId,
      mine.id,
      { date: '2026-11-02', amountCents: 100 },
    );
    const id = s.alicePersonalId;
    for (const attempt of [
      s.list.execute('bob', id),
      s.summary.execute('bob', id),
      s.create.execute('bob', id, vacances),
      s.update.execute('bob', id, mine.id, vacances),
      s.remove.execute('bob', id, mine.id),
      s.deposits.execute('bob', id, mine.id),
      s.deposit.execute('bob', id, mine.id, {
        date: '2026-11-02',
        amountCents: 1,
      }),
      s.removeDeposit.execute('bob', id, mine.id, deposit.id),
    ]) {
      await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
    }
    // Ni depuis l'espace commun, ni depuis son propre espace personnel.
    for (const space of [s.commonId, s.bobPersonalId]) {
      await expect(
        s.deposits.execute('bob', space, mine.id),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        s.remove.execute('bob', space, mine.id),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        s.update.execute('bob', space, mine.id, vacances),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(await s.list.execute('bob', s.commonId)).toEqual([]);
    expect(await s.list.execute('bob', s.bobPersonalId)).toEqual([]);
    expect(await s.list.execute('alice', id)).toHaveLength(1);
  });
});
