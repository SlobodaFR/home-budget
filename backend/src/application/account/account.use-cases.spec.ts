import { NotFoundException } from '@nestjs/common';
import { DomainError } from '../../domain/shared/domain-error';
import { User } from '../../domain/user/user';
import { FakeClock } from '../../testing/fake-clock';
import {
  InMemoryAccountRepository,
  InMemoryHouseholdRepository,
  InMemoryRecurringItemRepository,
  InMemorySpaceRulesRepository,
  InMemoryTransactionRepository,
  InMemoryUserRepository,
} from '../../testing/in-memory-repositories';
import { CreateHouseholdUseCase } from '../household/create-household.use-case';
import { CreateInvitationUseCase } from '../household/create-invitation.use-case';
import { HouseholdViewBuilder } from '../household/household.dto';
import { JoinHouseholdUseCase } from '../household/join-household.use-case';
import { SpaceAccessService } from '../household/space-access.service';
import {
  CommitImportUseCase,
  PreviewImportUseCase,
} from '../import/import.use-cases';
import {
  CreateRecurringItemUseCase,
  UpdateRecurringItemUseCase,
} from '../recurring/recurring.use-cases';
import {
  CreateSpaceTransactionUseCase,
  DeleteSpaceTransactionUseCase,
  ListSpaceTransactionsUseCase,
  UpdateSpaceTransactionUseCase,
} from '../space/space-transaction.use-cases';
import { AccountAssignmentService } from './account-assignment.service';
import { AccountViewsService } from './account-views.service';
import {
  CreateAccountUseCase,
  DeleteAccountUseCase,
  ListAccountsUseCase,
  SaveAccountCommand,
  UpdateAccountUseCase,
} from './account.use-cases';

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
  const transactions = new InMemoryTransactionRepository();
  const recurring = new InMemoryRecurringItemRepository();
  const accounts = new InMemoryAccountRepository();
  const rules = new InMemorySpaceRulesRepository();
  const clock = FakeClock.at('2026-11-12T09:00:00Z');
  const assignment = new AccountAssignmentService(accounts);
  const views = new AccountViewsService(
    accounts,
    transactions,
    recurring,
    clock,
  );

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
    commonId: created.spaces.find((s) => s.kind === 'COMMON')!.id,
    alicePersonalId: created.spaces.find((s) => s.kind === 'PERSONAL')!.id,
    bobPersonalId: households.spaces.find((s) => s.ownerUserId === 'bob')!.id,
    list: new ListAccountsUseCase(access, views),
    create: new CreateAccountUseCase(access, accounts),
    update: new UpdateAccountUseCase(access, accounts),
    remove: new DeleteAccountUseCase(access, accounts, transactions, recurring),
    createTx: new CreateSpaceTransactionUseCase(
      access,
      transactions,
      assignment,
    ),
    updateTx: new UpdateSpaceTransactionUseCase(
      access,
      transactions,
      assignment,
    ),
    deleteTx: new DeleteSpaceTransactionUseCase(access, transactions),
    listTx: new ListSpaceTransactionsUseCase(access, transactions),
    createRec: new CreateRecurringItemUseCase(access, recurring, assignment),
    updateRec: new UpdateRecurringItemUseCase(access, recurring, assignment),
    preview: new PreviewImportUseCase(access, rules, transactions, assignment),
    commit: new CommitImportUseCase(access, transactions, assignment),
  };
}

const courant: SaveAccountCommand = {
  name: 'Compte commun',
  kind: 'CHECKING',
  openingBalanceCents: 100000,
  openingDate: '2026-10-01',
};

const expense = (accountId: string | null, over = {}) => ({
  kind: 'EXPENSE' as const,
  bloc: 'COURANT' as const,
  label: 'Courses',
  amountCents: 10000,
  date: new Date('2026-11-03T00:00:00Z'),
  accountId,
  ...over,
});

const rent = (accountId: string | null, over = {}) => ({
  kind: 'EXPENSE' as const,
  bloc: 'FIXE' as const,
  label: 'Loyer',
  amountCents: 110000,
  dayOfMonth: 20,
  startDate: '2026-01-01',
  endDate: null,
  active: true,
  accountId,
  ...over,
});

describe('account use cases', () => {
  it('creates with zeroed balances, lists, updates and deletes', async () => {
    const s = await setup();
    const created = await s.create.execute('alice', s.commonId, courant);
    expect(created).toEqual({
      id: expect.any(String),
      spaceId: s.commonId,
      name: 'Compte commun',
      kind: 'CHECKING',
      openingBalanceCents: 100000,
      openingDate: '2026-10-01',
      archived: false,
      balanceCents: 100000,
      projectedMonthEndCents: 100000,
      transactionCount: 0,
    });
    expect(await s.list.execute('bob', s.commonId)).toEqual([created]);

    await s.update.execute('bob', s.commonId, created.id, {
      ...courant,
      name: 'Courant joint',
      openingBalanceCents: -2000,
    });
    expect((await s.list.execute('alice', s.commonId))[0]).toMatchObject({
      name: 'Courant joint',
      openingBalanceCents: -2000,
      balanceCents: -2000,
      archived: false,
    });

    await s.remove.execute('alice', s.commonId, created.id);
    expect(await s.list.execute('alice', s.commonId)).toEqual([]);
  });

  it('keeps names unique in a space, ignoring case, but not across spaces', async () => {
    const s = await setup();
    const first = await s.create.execute('alice', s.commonId, courant);
    await expect(
      s.create.execute('bob', s.commonId, {
        ...courant,
        name: 'COMPTE COMMUN',
      }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      s.create.execute('bob', s.commonId, {
        ...courant,
        name: ' compte commun ',
      }),
    ).rejects.toThrow(/déjà ce nom/);
    // Même nom dans un autre espace : autorisé.
    await expect(
      s.create.execute('alice', s.alicePersonalId, courant),
    ).resolves.toBeDefined();
    // Se renommer en son propre nom (autre casse) : autorisé ; en celui d'un autre : refusé.
    await s.update.execute('alice', s.commonId, first.id, {
      ...courant,
      name: 'compte COMMUN',
    });
    const second = await s.create.execute('alice', s.commonId, {
      ...courant,
      name: 'Livret',
      kind: 'SAVINGS',
    });
    await expect(
      s.update.execute('alice', s.commonId, second.id, {
        ...courant,
        name: 'Compte Commun',
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('validates the fields', async () => {
    const s = await setup();
    for (const bad of [
      { name: '' },
      { name: 'x'.repeat(61) },
      { kind: 'AUTRE' as never },
      { openingBalanceCents: 1.5 },
      { openingDate: '2026-13-01' },
    ]) {
      await expect(
        s.create.execute('alice', s.commonId, { ...courant, ...bad }),
      ).rejects.toBeInstanceOf(DomainError);
    }
  });

  it('answers 404 for an unknown account or one from another space', async () => {
    const s = await setup();
    const personal = await s.create.execute(
      'alice',
      s.alicePersonalId,
      courant,
    );
    await expect(
      s.update.execute('alice', s.commonId, personal.id, courant),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      s.remove.execute('alice', s.commonId, personal.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      s.remove.execute('alice', s.commonId, 'nope'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('archives and unarchives, keeping the archived flag when omitted', async () => {
    const s = await setup();
    const a = await s.create.execute('alice', s.commonId, courant);
    await s.update.execute('alice', s.commonId, a.id, {
      ...courant,
      archived: true,
    });
    expect((await s.list.execute('alice', s.commonId))[0].archived).toBe(true);
    await s.update.execute('alice', s.commonId, a.id, courant);
    expect((await s.list.execute('alice', s.commonId))[0].archived).toBe(true);
    await s.update.execute('alice', s.commonId, a.id, {
      ...courant,
      archived: false,
    });
    expect((await s.list.execute('alice', s.commonId))[0].archived).toBe(false);
  });
});

describe('account balances and projection', () => {
  it('follows the attached operations and recurring items of the current month', async () => {
    const s = await setup();
    const a = await s.create.execute('alice', s.commonId, courant);
    const other = await s.create.execute('alice', s.commonId, {
      ...courant,
      name: 'Livret',
      kind: 'SAVINGS',
      openingBalanceCents: 500000,
    });
    await s.createTx.execute(
      'alice',
      s.commonId,
      expense(a.id, {
        kind: 'INCOME',
        bloc: null,
        label: 'Virements',
        amountCents: 300000,
      }),
    );
    await s.createTx.execute('alice', s.commonId, expense(a.id));
    await s.createTx.execute(
      'alice',
      s.commonId,
      expense(null, { amountCents: 99999 }),
    );
    await s.createRec.execute('alice', s.commonId, rent(a.id));
    await s.createRec.execute(
      'alice',
      s.commonId,
      rent(null, { label: 'Autre', amountCents: 4242 }),
    );
    await s.createRec.execute(
      'alice',
      s.commonId,
      rent(other.id, {
        label: 'Virement livret',
        bloc: 'EPARGNE',
        amountCents: 20000,
        dayOfMonth: 25,
      }),
    );

    const [courantView, livretView] = await s.list.execute('bob', s.commonId);
    // 100 000 + 300 000 - 10 000 ; le loyer du 20 est encore DUE au 12 novembre.
    expect(courantView).toMatchObject({
      name: 'Compte commun',
      balanceCents: 390000,
      projectedMonthEndCents: 390000 - 110000,
      transactionCount: 2,
    });
    expect(livretView).toMatchObject({
      name: 'Livret',
      balanceCents: 500000,
      projectedMonthEndCents: 480000,
      transactionCount: 0,
    });
  });

  it('does not project an occurrence already found in the operations, nor an archived account', async () => {
    const s = await setup();
    const a = await s.create.execute('alice', s.commonId, courant);
    await s.createRec.execute(
      'alice',
      s.commonId,
      rent(a.id, { dayOfMonth: 5 }),
    );
    await s.createTx.execute(
      'alice',
      s.commonId,
      expense(a.id, {
        label: 'PRLV LOYER',
        bloc: 'FIXE',
        amountCents: 110000,
        date: new Date('2026-11-05T00:00:00Z'),
      }),
    );
    expect((await s.list.execute('alice', s.commonId))[0]).toMatchObject({
      balanceCents: -10000,
      projectedMonthEndCents: -10000,
    });
    // Un loyer MISSING (jour passé, non retrouvé) pèse sur la projection.
    await s.createRec.execute(
      'alice',
      s.commonId,
      rent(a.id, { label: 'Assurance', amountCents: 4500, dayOfMonth: 8 }),
    );
    expect((await s.list.execute('alice', s.commonId))[0]).toMatchObject({
      projectedMonthEndCents: -14500,
    });
    await s.update.execute('alice', s.commonId, a.id, {
      ...courant,
      archived: true,
    });
    expect((await s.list.execute('alice', s.commonId))[0]).toMatchObject({
      balanceCents: -10000,
      projectedMonthEndCents: -10000,
    });
  });
});

describe('account projection with non-monthly payments', () => {
  it('only projects a yearly or quarterly payment in the month where it falls', async () => {
    const s = await setup(); // 12 novembre 2026
    const a = await s.create.execute('alice', s.commonId, courant);
    const projected = async () =>
      (await s.list.execute('alice', s.commonId))[0].projectedMonthEndCents;
    expect(await projected()).toBe(100000);
    // Annuelle en décembre : hors du mois courant.
    const yearly = await s.createRec.execute(
      'alice',
      s.commonId,
      rent(a.id, { frequency: 'YEARLY', monthOfYear: 12, amountCents: 60000 }),
    );
    expect(await projected()).toBe(100000);
    // Annuelle en novembre, le 20 : à venir.
    await s.updateRec.execute(
      'alice',
      s.commonId,
      yearly.id,
      rent(a.id, { frequency: 'YEARLY', monthOfYear: 11, amountCents: 60000 }),
    );
    expect(await projected()).toBe(40000);
    // Trimestrielle ancrée en février (fév., mai, août, nov.) : novembre compte.
    await s.updateRec.execute(
      'alice',
      s.commonId,
      yearly.id,
      rent(a.id, {
        frequency: 'QUARTERLY',
        monthOfYear: 2,
        amountCents: 60000,
      }),
    );
    expect(await projected()).toBe(40000);
    // Trimestrielle ancrée en janvier (janv., avr., juil., oct.) : pas novembre.
    await s.updateRec.execute(
      'alice',
      s.commonId,
      yearly.id,
      rent(a.id, {
        frequency: 'QUARTERLY',
        monthOfYear: 1,
        amountCents: 60000,
      }),
    );
    expect(await projected()).toBe(100000);
  });
});

describe('attaching operations, recurring items and imports to accounts', () => {
  it('exposes accountId on operations and recurring items', async () => {
    const s = await setup();
    const a = await s.create.execute('alice', s.commonId, courant);
    const created = await s.createTx.execute(
      'alice',
      s.commonId,
      expense(a.id),
    );
    expect(created.accountId).toBe(a.id);
    expect(
      (await s.createTx.execute('alice', s.commonId, expense(null))).accountId,
    ).toBeNull();
    expect(
      (
        await s.createTx.execute(
          'alice',
          s.commonId,
          expense(undefined as never),
        )
      ).accountId,
    ).toBeNull();
    const listed = await s.listTx.execute('alice', s.commonId, '2026-11');
    expect(listed.map((t) => t.accountId).sort()).toEqual(
      [a.id, null, null].sort(),
    );
    expect(
      (await s.createRec.execute('alice', s.commonId, rent(a.id))).accountId,
    ).toBe(a.id);
  });

  it('refuses an unknown, foreign or archived account (400)', async () => {
    const s = await setup();
    const common = await s.create.execute('alice', s.commonId, courant);
    const personal = await s.create.execute(
      'alice',
      s.alicePersonalId,
      courant,
    );
    const bobs = await s.create.execute('bob', s.bobPersonalId, courant);
    const archived = await s.create.execute('alice', s.commonId, {
      ...courant,
      name: 'Ancien',
    });
    await s.update.execute('alice', s.commonId, archived.id, {
      ...courant,
      name: 'Ancien',
      archived: true,
    });

    for (const id of ['nope', personal.id, bobs.id, archived.id]) {
      await expect(
        s.createTx.execute('alice', s.commonId, expense(id)),
      ).rejects.toBeInstanceOf(DomainError);
      await expect(
        s.createRec.execute('alice', s.commonId, rent(id)),
      ).rejects.toBeInstanceOf(DomainError);
    }
    // Le compte commun, lui, n'est pas utilisable depuis un espace personnel.
    await expect(
      s.createTx.execute('alice', s.alicePersonalId, expense(common.id)),
    ).rejects.toThrow(/n'existe pas dans cet espace/);
    // Le compte personnel d'Alice est inutilisable par Bob : 404 sur l'espace, 400 sur un autre.
    await expect(
      s.createTx.execute('bob', s.alicePersonalId, expense(personal.id)),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      s.createTx.execute('bob', s.bobPersonalId, expense(personal.id)),
    ).rejects.toBeInstanceOf(DomainError);
    expect(await s.listTx.execute('alice', s.commonId, '2026-11')).toEqual([]);
  });

  it('moves an operation between accounts and lets an archived assignment stay', async () => {
    const s = await setup();
    const a = await s.create.execute('alice', s.commonId, courant);
    const b = await s.create.execute('alice', s.commonId, {
      ...courant,
      name: 'Livret',
    });
    const tx = await s.createTx.execute('alice', s.commonId, expense(a.id));
    await s.updateTx.execute('alice', s.commonId, tx.id, expense(b.id));
    expect(
      (await s.listTx.execute('alice', s.commonId, '2026-11'))[0].accountId,
    ).toBe(b.id);

    await s.update.execute('alice', s.commonId, b.id, {
      ...courant,
      name: 'Livret',
      archived: true,
    });
    // Corriger le libellé en gardant le compte archivé : permis.
    await s.updateTx.execute(
      'alice',
      s.commonId,
      tx.id,
      expense(b.id, { label: 'Corrigé' }),
    );
    // Y rattacher une autre opération : refusé.
    const other = await s.createTx.execute('alice', s.commonId, expense(null));
    await expect(
      s.updateTx.execute('alice', s.commonId, other.id, expense(b.id)),
    ).rejects.toThrow(/archivé/);
    // Détacher : permis.
    await s.updateTx.execute('alice', s.commonId, tx.id, expense(null));
    expect(
      (await s.list.execute('alice', s.commonId)).find((v) => v.id === b.id)!
        .transactionCount,
    ).toBe(0);
  });

  it('refuses to delete an account in use, then allows it once it is free', async () => {
    const s = await setup();
    const a = await s.create.execute('alice', s.commonId, courant);
    const tx = await s.createTx.execute('alice', s.commonId, expense(a.id));
    await expect(s.remove.execute('alice', s.commonId, a.id)).rejects.toThrow(
      /archivez-le/,
    );
    await s.deleteTx.execute('alice', s.commonId, tx.id);
    const rec = await s.createRec.execute('alice', s.commonId, rent(a.id));
    await expect(
      s.remove.execute('alice', s.commonId, a.id),
    ).rejects.toBeInstanceOf(DomainError);
    await s.updateRec.execute('alice', s.commonId, rec.id, rent(null));
    await expect(
      s.remove.execute('alice', s.commonId, a.id),
    ).resolves.toBeUndefined();
  });

  it('attaches every committed import row to the chosen account, all or nothing', async () => {
    const s = await setup();
    const a = await s.create.execute('alice', s.commonId, courant);
    const items = [
      {
        kind: 'EXPENSE' as const,
        bloc: 'FIXE' as const,
        label: 'PRLV LOYER',
        amountCents: 110000,
        date: new Date('2026-11-02T00:00:00Z'),
      },
      {
        kind: 'INCOME' as const,
        label: 'VIR SALAIRE',
        amountCents: 380000,
        date: new Date('2026-11-05T00:00:00Z'),
      },
    ];
    await expect(
      s.commit.execute('alice', s.commonId, items, a.id),
    ).resolves.toEqual({ created: 2 });
    const listed = await s.listTx.execute('alice', s.commonId, '2026-11');
    expect(listed.map((t) => t.accountId)).toEqual([a.id, a.id]);
    expect((await s.list.execute('alice', s.commonId))[0]).toMatchObject({
      balanceCents: 100000 + 380000 - 110000,
      transactionCount: 2,
    });

    await expect(
      s.commit.execute('alice', s.commonId, items, 'nope'),
    ).rejects.toBeInstanceOf(DomainError);
    expect(await s.listTx.execute('alice', s.commonId, '2026-11')).toHaveLength(
      2,
    );
    // Sans accountId : non rattachées, comme avant.
    await s.commit.execute('alice', s.commonId, items);
    expect(
      (await s.listTx.execute('alice', s.commonId, '2026-11')).filter(
        (t) => t.accountId === null,
      ),
    ).toHaveLength(2);
  });

  it('validates the account on preview without changing its result', async () => {
    const s = await setup();
    const a = await s.create.execute('alice', s.commonId, courant);
    const text = 'Date;Libellé;Montant\n02/11/2026;PRLV LOYER;-1100,00';
    const without = await s.preview.execute('alice', s.commonId, text);
    const withAccount = await s.preview.execute(
      'alice',
      s.commonId,
      text,
      a.id,
    );
    expect(withAccount).toEqual(without);
    await expect(
      s.preview.execute('alice', s.commonId, text, 'nope'),
    ).rejects.toBeInstanceOf(DomainError);
    const mine = await s.create.execute('alice', s.alicePersonalId, courant);
    await expect(
      s.preview.execute('alice', s.commonId, text, mine.id),
    ).rejects.toBeInstanceOf(DomainError);
  });
});

describe('isolation of personal accounts', () => {
  it('hides the personal accounts of another member on every use case', async () => {
    const s = await setup();
    const mine = await s.create.execute('alice', s.alicePersonalId, courant);
    const id = s.alicePersonalId;
    const attempts: Promise<unknown>[] = [
      s.list.execute('bob', id),
      s.create.execute('bob', id, { ...courant, name: 'Intrus' }),
      s.update.execute('bob', id, mine.id, courant),
      s.remove.execute('bob', id, mine.id),
    ];
    for (const attempt of attempts) {
      await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(await s.list.execute('alice', id)).toHaveLength(1);
    expect(await s.list.execute('bob', s.bobPersonalId)).toEqual([]);
    expect(await s.list.execute('bob', s.commonId)).toEqual([]);
  });
});
