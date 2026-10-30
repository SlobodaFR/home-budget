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
    const restored: { name: string }[] = await ds.query(
      `SELECT name FROM pragma_table_info('transactions')`,
    );
    expect(restored.map((c) => c.name)).toContain('account_id');
    await ds.destroy();
  });

  it('is idempotent once applied', async () => {
    const ds = await dataSource().initialize();
    await ds.runMigrations();
    await expect(ds.runMigrations()).resolves.toEqual([]);
    await ds.destroy();
  });
});
