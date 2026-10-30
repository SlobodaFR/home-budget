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
    await ds.undoLastMigration();
    await ds.undoLastMigration();
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

    await ds.undoLastMigration(); // tranche 10
    await ds.undoLastMigration(); // tranche 9
    await ds.undoLastMigration(); // tranche 8
    await ds.undoLastMigration(); // tranche 7
    await ds.undoLastMigration(); // tranche 6
    await ds.undoLastMigration(); // tranche 5
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
    await ds.undoLastMigration(); // tranche 10
    await ds.undoLastMigration(); // tranche 9
    await ds.undoLastMigration(); // tranche 8
    await ds.undoLastMigration(); // tranche 7
    await ds.undoLastMigration(); // tranche 6
    await ds.undoLastMigration(); // tranche 5
    await ds.undoLastMigration(); // tranche 4
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

  it('adds frequency (default MONTHLY) and month_of_year without touching existing rows, and undoes them', async () => {
    const ds = await dataSource().initialize();
    await ds.runMigrations();
    await ds.undoLastMigration(); // tranche 10
    await ds.undoLastMigration(); // tranche 9
    await ds.undoLastMigration(); // tranche 8
    await ds.undoLastMigration(); // tranche 7
    await ds.undoLastMigration(); // tranche 6
    await ds.undoLastMigration(); // revient à la tranche 4
    await ds.query(
      `INSERT INTO "recurring_items" ("id","space_id","kind","bloc","day_of_month","start_date","active","label","amount_cents") VALUES ('r1','s1','EXPENSE','FIXE',5,'2026-01-01',1,'Loyer',110000)`,
    );

    await ds.runMigrations();
    const rows: Record<string, unknown>[] = await ds.query(
      `SELECT * FROM recurring_items`,
    );
    expect(rows).toEqual([
      expect.objectContaining({
        id: 'r1',
        label: 'Loyer',
        amount_cents: 110000,
        day_of_month: 5,
        frequency: 'MONTHLY',
        month_of_year: null,
      }),
    ]);
    const drift = await ds.driver.createSchemaBuilder().log();
    expect(drift.upQueries.map((q) => q.query)).toEqual([]);

    await ds.undoLastMigration(); // tranche 10
    await ds.undoLastMigration(); // tranche 9
    await ds.undoLastMigration(); // tranche 8
    await ds.undoLastMigration(); // tranche 7
    await ds.undoLastMigration(); // tranche 6
    await ds.undoLastMigration(); // tranche 5
    const columns: { name: string }[] = await ds.query(
      `SELECT name FROM pragma_table_info('recurring_items')`,
    );
    expect(columns.map((c) => c.name)).not.toEqual(
      expect.arrayContaining(['frequency']),
    );
    expect(columns.map((c) => c.name)).not.toContain('month_of_year');
    expect(await ds.query(`SELECT label FROM recurring_items`)).toEqual([
      { label: 'Loyer' },
    ]);
    await ds.destroy();
  });

  it('creates the tranche 6 project tables with their indexes, and undoes them', async () => {
    const ds = await dataSource().initialize();
    await ds.runMigrations();
    const columnsOf = async (table: string) => {
      const rows: { name: string }[] = await ds.query(
        `SELECT name FROM pragma_table_info('${table}')`,
      );
      return rows.map((row) => row.name);
    };
    expect(await columnsOf('projects')).toEqual(
      expect.arrayContaining([
        'id',
        'space_id',
        'kind',
        'target_date',
        'start_date',
        'archived',
        'account_id',
        'name',
        'target_cents',
        'start_cents',
        'secret_payload',
      ]),
    );
    expect(await columnsOf('project_deposits')).toEqual(
      expect.arrayContaining([
        'id',
        'project_id',
        'space_id',
        'date',
        'amount_cents',
        'note',
        'secret_payload',
      ]),
    );
    const indexes: { name: string }[] = await ds.query(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_project%'`,
    );
    expect(indexes.map((i) => i.name).sort()).toEqual([
      'idx_project_deposits_project',
      'idx_project_deposits_space',
      'idx_projects_space',
    ]);
    // Les tables des tranches précédentes sont intactes.
    await ds.query(
      `INSERT INTO "recurring_items" ("id","space_id","kind","start_date","active","label","amount_cents") VALUES ('r1','s1','EXPENSE','2026-01-01',1,'Loyer',100)`,
    );

    await ds.undoLastMigration(); // tranche 10
    await ds.undoLastMigration(); // tranche 9
    await ds.undoLastMigration(); // tranche 8
    await ds.undoLastMigration(); // tranche 7
    await ds.undoLastMigration(); // tranche 6
    expect(await columnsOf('projects')).toEqual([]);
    expect(await columnsOf('project_deposits')).toEqual([]);
    expect(await ds.query(`SELECT id FROM recurring_items`)).toEqual([
      { id: 'r1' },
    ]);
    await ds.runMigrations();
    expect(await columnsOf('projects')).toContain('target_cents');
    await ds.destroy();
  });

  it('creates the tranche 7 month_reviews table with a unique (space, month) key, and undoes it', async () => {
    const ds = await dataSource().initialize();
    await ds.runMigrations();
    const columns: { name: string; pk: number }[] = await ds.query(
      `SELECT name, pk FROM pragma_table_info('month_reviews')`,
    );
    expect(columns.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'space_id',
        'month',
        'completed_at',
        'went_well',
        'surprise',
        'decision',
        'secret_payload',
      ]),
    );
    expect(
      columns
        .filter((c) => c.pk > 0)
        .map((c) => c.name)
        .sort(),
    ).toEqual(['month', 'space_id']);
    await ds.query(
      `INSERT INTO "month_reviews" ("space_id","month") VALUES ('s1','2026-10')`,
    );
    await expect(
      ds.query(
        `INSERT INTO "month_reviews" ("space_id","month") VALUES ('s1','2026-10')`,
      ),
    ).rejects.toThrow(/UNIQUE|PRIMARY/i);
    await ds.query(
      `INSERT INTO "month_reviews" ("space_id","month") VALUES ('s1','2026-11'), ('s2','2026-10')`,
    );

    await ds.undoLastMigration(); // tranche 10
    await ds.undoLastMigration(); // tranche 9
    await ds.undoLastMigration(); // tranche 8
    await ds.undoLastMigration(); // tranche 7
    expect(
      await ds.query(
        `SELECT name FROM sqlite_master WHERE name = 'month_reviews'`,
      ),
    ).toEqual([]);
    await ds.runMigrations();
    expect(await ds.query(`SELECT COUNT(*) AS n FROM month_reviews`)).toEqual([
      { n: 0 },
    ]);
    const drift = await ds.driver.createSchemaBuilder().log();
    expect(drift.upQueries.map((q) => q.query)).toEqual([]);
    await ds.destroy();
  });

  it('creates the tranche 8 debts table with its index, and undoes it', async () => {
    const ds = await dataSource().initialize();
    await ds.runMigrations();
    const columns: { name: string }[] = await ds.query(
      `SELECT name FROM pragma_table_info('debts')`,
    );
    expect(columns.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'id',
        'space_id',
        'kind',
        'start_date',
        'payment_day',
        'archived',
        'recurring_id',
        'name',
        'principal_cents',
        'remaining_cents',
        'annual_rate_hundredths',
        'monthly_payment_cents',
        'insurance_monthly_cents',
        'secret_payload',
      ]),
    );
    const indexes: { name: string }[] = await ds.query(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_debts_space'`,
    );
    expect(indexes).toHaveLength(1);
    await ds.query(
      `INSERT INTO "month_reviews" ("space_id","month") VALUES ('s1','2026-10')`,
    );

    await ds.undoLastMigration(); // tranche 10
    await ds.undoLastMigration(); // tranche 9
    await ds.undoLastMigration(); // tranche 8
    expect(
      await ds.query(`SELECT name FROM sqlite_master WHERE name = 'debts'`),
    ).toEqual([]);
    expect(await ds.query(`SELECT month FROM month_reviews`)).toEqual([
      { month: '2026-10' },
    ]);
    await ds.runMigrations();
    expect(await ds.query(`SELECT COUNT(*) AS n FROM debts`)).toEqual([
      { n: 0 },
    ]);
    const drift = await ds.driver.createSchemaBuilder().log();
    expect(drift.upQueries.map((q) => q.query)).toEqual([]);
    await ds.destroy();
  });

  it('adds the tranche 9 contribution columns and index without touching existing rows, and undoes them', async () => {
    const ds = await dataSource().initialize();
    await ds.runMigrations();
    const columnsOf = async () => {
      const rows: { name: string; notnull: number }[] = await ds.query(
        `SELECT name, "notnull" FROM pragma_table_info('transactions')`,
      );
      return rows;
    };
    const columns = await columnsOf();
    for (const name of ['contribution_user_id', 'contribution_month']) {
      expect(columns).toContainEqual(
        expect.objectContaining({ name, notnull: 0 }),
      );
    }
    const indexColumns: { name: string }[] = await ds.query(
      `SELECT name FROM pragma_index_info('idx_transactions_contribution') ORDER BY seqno`,
    );
    expect(indexColumns.map((c) => c.name)).toEqual([
      'space_id',
      'contribution_month',
      'contribution_user_id',
    ]);

    await ds.undoLastMigration(); // tranche 10
    await ds.undoLastMigration(); // tranche 9
    expect((await columnsOf()).map((c) => c.name)).not.toEqual(
      expect.arrayContaining(['contribution_user_id']),
    );
    expect(
      await ds.query(
        `SELECT name FROM sqlite_master WHERE name = 'idx_transactions_contribution'`,
      ),
    ).toEqual([]);
    await ds.query(
      `INSERT INTO "transactions" ("id","space_id","kind","date","label","amount_cents") VALUES ('t1','s1','INCOME','2026-11-01T00:00:00.000Z','Salaire',100000)`,
    );
    await ds.runMigrations();
    expect(
      await ds.query(
        `SELECT id, label, amount_cents, contribution_user_id, contribution_month FROM transactions`,
      ),
    ).toEqual([
      {
        id: 't1',
        label: 'Salaire',
        amount_cents: 100000,
        contribution_user_id: null,
        contribution_month: null,
      },
    ]);
    const drift = await ds.driver.createSchemaBuilder().log();
    expect(drift.upQueries.map((q) => q.query)).toEqual([]);
    await ds.destroy();
  });

  it('creates the tranche 10 life event tables with their index and composite key, and undoes them', async () => {
    const ds = await dataSource().initialize();
    await ds.runMigrations();
    const columnsOf = async (table: string) => {
      const rows: { name: string; pk: number; notnull: number }[] =
        await ds.query(
          `SELECT name, pk, "notnull" FROM pragma_table_info('${table}')`,
        );
      return rows;
    };
    expect((await columnsOf('life_events')).map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'id',
        'household_id',
        'type',
        'label',
        'event_date',
        'created_at',
      ]),
    );
    const steps = await columnsOf('life_event_steps');
    expect(steps.map((c) => c.name).sort()).toEqual([
      'done_at',
      'event_id',
      'note',
      'step_id',
    ]);
    expect(
      steps
        .filter((c) => c.pk > 0)
        .map((c) => c.name)
        .sort(),
    ).toEqual(['event_id', 'step_id']);
    expect(steps.find((c) => c.name === 'done_at')?.notnull).toBe(0);
    const indexes: { name: string }[] = await ds.query(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_life_events_household'`,
    );
    expect(indexes).toHaveLength(1);
    await ds.query(
      `INSERT INTO "life_event_steps" ("event_id","step_id","done_at","note") VALUES ('e1','s1',NULL,'')`,
    );
    await expect(
      ds.query(
        `INSERT INTO "life_event_steps" ("event_id","step_id","done_at","note") VALUES ('e1','s1',NULL,'')`,
      ),
    ).rejects.toThrow(/UNIQUE|PRIMARY/i);

    // Les données des tranches précédentes survivent à l'annulation.
    await ds.query(
      `INSERT INTO "transactions" ("id","space_id","kind","date","label","amount_cents","contribution_user_id","contribution_month") VALUES ('t1','s1','INCOME','2026-11-01T00:00:00.000Z','Contribution',100,'u1','2026-11')`,
    );
    await ds.undoLastMigration(); // tranche 10
    for (const table of ['life_events', 'life_event_steps']) {
      expect(
        await ds.query(
          `SELECT name FROM sqlite_master WHERE name = '${table}'`,
        ),
      ).toEqual([]);
    }
    expect(
      await ds.query(`SELECT contribution_month FROM transactions`),
    ).toEqual([{ contribution_month: '2026-11' }]);
    await ds.runMigrations();
    expect(await ds.query(`SELECT COUNT(*) AS n FROM life_events`)).toEqual([
      { n: 0 },
    ]);
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
