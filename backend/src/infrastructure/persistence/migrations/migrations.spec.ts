import { DataSource } from 'typeorm';
import { ORM_ENTITIES } from '../database.module';
import { MIGRATIONS } from '.';

function dataSource() {
  return new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: ORM_ENTITIES,
    migrations: MIGRATIONS,
    synchronize: false,
  });
}

describe('FoyerSchema migration', () => {
  it('builds a schema identical to the ORM entities (no drift)', async () => {
    const ds = await dataSource().initialize();
    await ds.runMigrations();
    const drift = await ds.driver.createSchemaBuilder().log();
    expect(drift.upQueries.map((q) => q.query)).toEqual([]);
    await ds.destroy();
  });

  it('keeps the legacy tables under a legacy_ prefix and is reversible', async () => {
    const ds = await dataSource().initialize();
    await ds.query(
      `CREATE TABLE "users" ("id" text PRIMARY KEY NOT NULL, "email" text NOT NULL, "name" text NOT NULL, "avatar_url" text NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await ds.query(
      `CREATE TABLE "accounts" ("id" text PRIMARY KEY NOT NULL, "user_id" text NOT NULL, "name" text NOT NULL, "type" text NOT NULL, "icon" text NOT NULL, "monthly_budget_cents" integer)`,
    );
    await ds.query(
      `CREATE TABLE "transactions" ("id" text PRIMARY KEY NOT NULL, "account_id" text NOT NULL, "label" text NOT NULL, "category" text NOT NULL, "amount_cents" integer NOT NULL, "date" datetime NOT NULL)`,
    );
    await ds.query(
      `INSERT INTO "accounts" VALUES ('a1', 'u1', 'Courant', 'EXPENSE', 'x', 150000)`,
    );
    await ds.query(
      `INSERT INTO "users" ("id","email","name","avatar_url") VALUES ('u1','u@x.fr','U','')`,
    );

    await ds.runMigrations();

    expect(await ds.query(`SELECT id FROM legacy_accounts`)).toEqual([
      { id: 'a1' },
    ]);
    const columns: { name: string }[] = await ds.query(
      `SELECT name FROM pragma_table_info('transactions')`,
    );
    expect(columns.map((c) => c.name)).toContain('space_id');
    expect(await ds.query(`SELECT id FROM users`)).toEqual([{ id: 'u1' }]);
    const drift = await ds.driver.createSchemaBuilder().log();
    expect(drift.upQueries.map((q) => q.query)).toEqual([]);

    await ds.undoLastMigration();
    await ds.undoLastMigration();
    await ds.undoLastMigration();
    await ds.undoLastMigration();
    const restored: { name: string }[] = await ds.query(
      `SELECT name FROM pragma_table_info('transactions')`,
    );
    expect(restored.map((c) => c.name)).toContain('account_id');
    await ds.destroy();
  });

  it('creates the tranche 3 tables and removes them when undone', async () => {
    const tables = async (ds: DataSource) => {
      const rows: { name: string }[] = await ds.query(
        `SELECT name FROM sqlite_master WHERE type = 'table'`,
      );
      return rows.map((row) => row.name);
    };
    const ds = await dataSource().initialize();
    await ds.runMigrations();
    expect(await tables(ds)).toEqual(
      expect.arrayContaining([
        'recurring_items',
        'safety_nets',
        'household_fiscal_profiles',
      ]),
    );
    const columns: { name: string }[] = await ds.query(
      `SELECT name FROM pragma_table_info('recurring_items')`,
    );
    expect(columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['label', 'amount_cents', 'secret_payload']),
    );

    await ds.undoLastMigration(); // tranche 4
    await ds.undoLastMigration(); // tranche 3
    const after = await tables(ds);
    for (const dropped of [
      'recurring_items',
      'safety_nets',
      'household_fiscal_profiles',
    ]) {
      expect(after).not.toContain(dropped);
    }
    expect(after).toContain('space_rules');
    await ds.runMigrations();
    expect(await tables(ds)).toContain('recurring_items');
    await ds.destroy();
  });

  it('creates the tranche 4 accounts and account_id columns, and undoes them', async () => {
    const columnsOf = async (ds: DataSource, table: string) => {
      const rows: { name: string }[] = await ds.query(
        `SELECT name FROM pragma_table_info('${table}')`,
      );
      return rows.map((row) => row.name);
    };
    const ds = await dataSource().initialize();
    await ds.runMigrations();
    expect(await columnsOf(ds, 'accounts')).toEqual(
      expect.arrayContaining([
        'id',
        'space_id',
        'kind',
        'opening_date',
        'archived',
        'name',
        'opening_balance_cents',
        'secret_payload',
      ]),
    );
    expect(await columnsOf(ds, 'transactions')).toContain('account_id');
    expect(await columnsOf(ds, 'recurring_items')).toContain('account_id');

    await ds.query(
      `INSERT INTO "transactions" ("id","space_id","kind","date","account_id") VALUES ('t1','s1','INCOME','2026-11-01T00:00:00.000Z','a1')`,
    );
    await ds.undoLastMigration();
    expect(await columnsOf(ds, 'accounts')).toEqual([]);
    expect(await columnsOf(ds, 'transactions')).not.toContain('account_id');
    expect(await columnsOf(ds, 'recurring_items')).not.toContain('account_id');
    // Les données existantes survivent à l'annulation.
    expect(await ds.query(`SELECT id FROM transactions`)).toEqual([
      { id: 't1' },
    ]);
    await ds.runMigrations();
    expect(await columnsOf(ds, 'transactions')).toContain('account_id');
    const drift = await ds.driver.createSchemaBuilder().log();
    expect(drift.upQueries.map((q) => q.query)).toEqual([]);
    await ds.destroy();
  });

  it('is idempotent once applied', async () => {
    const ds = await dataSource().initialize();
    await ds.runMigrations();
    await expect(ds.runMigrations()).resolves.toEqual([]);
    await ds.destroy();
  });
});
