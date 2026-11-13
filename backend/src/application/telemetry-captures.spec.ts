import { ConflictException } from '@nestjs/common';
import { User } from '../domain/user/user';
import { FakeClock } from '../testing/fake-clock';
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
} from '../testing/in-memory-repositories';
import { SpyTelemetry } from '../testing/spy-telemetry';
import { AccountAssignmentService } from './account/account-assignment.service';
import {
  ExportDataUseCase,
  ExportTransactionsCsvUseCase,
} from './export/export.use-cases';
import { CreateHouseholdUseCase } from './household/create-household.use-case';
import { HouseholdViewBuilder } from './household/household.dto';
import { SpaceAccessService } from './household/space-access.service';
import { CommitImportUseCase } from './import/import.use-cases';

async function setup() {
  const households = new InMemoryHouseholdRepository();
  const users = new InMemoryUserRepository();
  await users.save(
    User.create({
      id: 'alice',
      email: 'alice@example.test',
      name: 'alice',
      avatarUrl: '',
      createdAt: new Date(),
    }),
  );
  const view = new HouseholdViewBuilder(users);
  const access = new SpaceAccessService(households);
  const transactions = new InMemoryTransactionRepository();
  const accounts = new InMemoryAccountRepository();
  const telemetry = new SpyTelemetry();
  const create = new CreateHouseholdUseCase(households, view, telemetry);
  return {
    telemetry,
    create,
    access,
    view,
    transactions,
    accounts,
    households,
    commit: new CommitImportUseCase(
      access,
      transactions,
      new AccountAssignmentService(accounts),
      telemetry,
    ),
    exportData: new ExportDataUseCase(
      access,
      view,
      new InMemorySpacePlanRepository(),
      transactions,
      new InMemoryRecurringItemRepository(),
      accounts,
      new InMemoryProjectRepository(),
      new InMemoryMonthReviewRepository(),
      new InMemorySafetyNetRepository(),
      new InMemoryFiscalProfileRepository(),
      FakeClock.at('2026-11-12T09:00:00Z'),
      telemetry,
    ),
    exportCsv: new ExportTransactionsCsvUseCase(
      access,
      transactions,
      accounts,
      telemetry,
    ),
  };
}

describe('télémétrie des cas d’usage (après succès, sans donnée personnelle)', () => {
  it('household_created après la création, avec le membre', async () => {
    const s = await setup();
    await s.create.execute('alice', { name: 'Foyer Dupont' });
    expect(s.telemetry.captured).toEqual([
      {
        event: { name: 'household_created', properties: {} },
        userId: 'alice',
      },
    ]);
    expect(JSON.stringify(s.telemetry.captured)).not.toContain('Dupont');
  });

  it('ne rapporte rien si la création échoue', async () => {
    const s = await setup();
    await s.create.execute('alice', { name: 'F' });
    s.telemetry.captured.length = 0;
    await expect(
      s.create.execute('alice', { name: 'G' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(s.telemetry.captured).toEqual([]);
  });

  it('statement_imported avec le nombre de lignes, jamais leur contenu', async () => {
    const s = await setup();
    const created = await s.create.execute('alice', { name: 'F' });
    const commonId = created.spaces.find((x) => x.kind === 'COMMON')!.id;
    s.telemetry.captured.length = 0;
    await s.commit.execute('alice', commonId, [
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
    expect(s.telemetry.captured).toEqual([
      {
        event: { name: 'statement_imported', properties: { rows: 2 } },
        userId: 'alice',
      },
    ]);
    expect(JSON.stringify(s.telemetry.captured)).not.toMatch(/LOYER|110000/);
  });

  it('ne rapporte pas un import refusé', async () => {
    const s = await setup();
    await s.create.execute('alice', { name: 'F' });
    s.telemetry.captured.length = 0;
    await expect(s.commit.execute('alice', 'inconnu', [])).rejects.toThrow(
      'Espace introuvable',
    );
    expect(s.telemetry.captured).toEqual([]);
  });

  it('data_exported json puis csv', async () => {
    const s = await setup();
    const created = await s.create.execute('alice', { name: 'F' });
    const commonId = created.spaces.find((x) => x.kind === 'COMMON')!.id;
    s.telemetry.captured.length = 0;
    await s.exportData.execute('alice');
    await s.exportCsv.execute('alice', commonId, '2026-10-01', '2026-10-31');
    expect(s.telemetry.captured).toEqual([
      {
        event: { name: 'data_exported', properties: { format: 'json' } },
        userId: 'alice',
      },
      {
        event: { name: 'data_exported', properties: { format: 'csv' } },
        userId: 'alice',
      },
    ]);
  });

  it('ne rapporte pas un export refusé', async () => {
    const s = await setup();
    await expect(s.exportData.execute('loner')).rejects.toThrow('Aucun foyer');
    await expect(
      s.exportCsv.execute('loner', 'x', '2026-10-01', '2026-10-31'),
    ).rejects.toThrow('Aucun foyer');
    expect(s.telemetry.captured).toEqual([]);
  });
});
