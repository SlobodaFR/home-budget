import { NotFoundException } from '@nestjs/common';
import { User } from '../../domain/user/user';
import {
  InMemoryHouseholdRepository,
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
  GetRulesUseCase,
  PreviewImportUseCase,
  SaveRulesUseCase,
} from './import.use-cases';

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
  const rules = new InMemorySpaceRulesRepository();
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
    transactions,
    commonId: created.spaces.find((s) => s.kind === 'COMMON')!.id,
    alicePersonalId: created.spaces.find((s) => s.kind === 'PERSONAL')!.id,
    preview: new PreviewImportUseCase(access, rules, transactions),
    commit: new CommitImportUseCase(access, transactions),
    getRules: new GetRulesUseCase(access, rules),
    saveRules: new SaveRulesUseCase(access, rules),
  };
}

const statement = [
  'Date;Libellé;Montant',
  '02/10/2026;PRLV LOYER;-1 100,00',
  '03/10/2026;CB CARREFOUR;-142,30',
  '04/10/2026;CB SUPER U;-58,20',
  '05/10/2026;VIR SALAIRE;3 800,00',
  '06/10/2026;VIREMENT INTERNE COMPTE JOINT;-200,00',
].join('\n');

describe('PreviewImportUseCase', () => {
  it('suggests a target for each line with the default rules', async () => {
    const s = await setup();
    const result = await s.preview.execute('alice', s.commonId, statement);
    expect(result.rows.map((r) => [r.label, r.suggestion.target])).toEqual([
      ['PRLV LOYER', 'FIXE'],
      ['CB CARREFOUR', 'COURANT'],
      ['CB SUPER U', null],
      ['VIR SALAIRE', 'INCOME'],
      ['VIREMENT INTERNE COMPTE JOINT', 'IGNORE'],
    ]);
    expect(result.skipped).toEqual([{ line: 1, reason: 'en-tete' }]);
  });

  it('stores nothing', async () => {
    const s = await setup();
    await s.preview.execute('alice', s.commonId, statement);
    expect(s.transactions.items.size).toBe(0);
  });

  it('flags lines already imported, consuming each existing operation once', async () => {
    const s = await setup();
    await s.commit.execute('alice', s.commonId, [
      {
        kind: 'EXPENSE',
        bloc: 'COURANT',
        label: 'cb carrefour',
        amountCents: 14230,
        date: new Date('2026-10-03T00:00:00Z'),
      },
    ]);
    const twice = [
      '03/10/2026;CB CARREFOUR;-142,30',
      '03/10/2026;CB CARREFOUR;-142,30',
      '03/10/2026;CB CARREFOUR;142,30',
    ].join('\n');
    const result = await s.preview.execute('alice', s.commonId, twice);
    expect(result.rows.map((r) => r.duplicate)).toEqual([true, false, false]);
  });

  it('uses the rules saved for the space and falls back to the defaults', async () => {
    const s = await setup();
    expect((await s.getRules.execute('alice', s.commonId)).isDefault).toBe(
      true,
    );
    await s.saveRules.execute('alice', s.commonId, [
      { keyword: 'Super U', target: 'COURANT' },
    ]);
    expect(await s.getRules.execute('alice', s.commonId)).toEqual({
      rules: [{ keyword: 'super u', target: 'COURANT' }],
      isDefault: false,
    });
    const result = await s.preview.execute('alice', s.commonId, statement);
    expect(
      result.rows.find((r) => r.label === 'CB SUPER U')?.suggestion,
    ).toEqual({ target: 'COURANT', rule: 'super u' });
    expect(
      result.rows.find((r) => r.label === 'PRLV LOYER')?.suggestion.target,
    ).toBeNull();
  });
});

describe('CommitImportUseCase', () => {
  it('creates the operations, all or nothing', async () => {
    const s = await setup();
    const result = await s.commit.execute('alice', s.commonId, [
      {
        kind: 'EXPENSE',
        bloc: 'FIXE',
        label: 'PRLV LOYER',
        amountCents: 110000,
        date: new Date('2026-10-02T00:00:00Z'),
      },
      {
        kind: 'INCOME',
        label: 'VIR SALAIRE',
        amountCents: 380000,
        date: new Date('2026-10-05T00:00:00Z'),
      },
    ]);
    expect(result).toEqual({ created: 2 });
    expect(s.transactions.items.size).toBe(2);

    const before = s.transactions.items.size;
    await expect(
      s.commit.execute('alice', s.commonId, [
        {
          kind: 'EXPENSE',
          bloc: 'FIXE',
          label: 'OK',
          amountCents: 100,
          date: new Date('2026-10-02T00:00:00Z'),
        },
        {
          kind: 'EXPENSE',
          label: 'SANS BLOC',
          amountCents: 100,
          date: new Date('2026-10-02T00:00:00Z'),
        },
      ]),
    ).rejects.toThrow('bloc');
    expect(s.transactions.items.size).toBe(before);
  });
});

describe('import isolation', () => {
  it('hides the personal space of another member on every import use case', async () => {
    const s = await setup();
    const id = s.alicePersonalId;
    const item = {
      kind: 'INCOME' as const,
      label: 'X',
      amountCents: 100,
      date: new Date('2026-10-02T00:00:00Z'),
    };
    for (const attempt of [
      s.preview.execute('bob', id, statement),
      s.commit.execute('bob', id, [item]),
      s.getRules.execute('bob', id),
      s.saveRules.execute('bob', id, [{ keyword: 'loyer', target: 'FIXE' }]),
    ]) {
      await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(s.transactions.items.size).toBe(0);
  });
});
