// Reference spec of the harness convention `sqlite-serialized-transactions`: copy next to
// serialized-connection.ts. Self-contained (in-memory database, one EntitySchema), so it runs
// unchanged on TypeORM 0.3.x and 1.1.x. Vitest globals (`describe`, `it`, `expect`).
import { DataSource, EntitySchema } from 'typeorm';
import { serializeConnection } from './serialized-connection';

interface Item {
  id: string;
  label: string;
}

const ItemSchema = new EntitySchema<Item>({
  name: 'Item',
  tableName: 'items',
  columns: {
    id: { type: 'varchar', primary: true },
    label: { type: 'varchar', nullable: false },
  },
});

async function open(
  serialize: boolean,
  options?: Parameters<typeof serializeConnection>[1],
) {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [ItemSchema],
    synchronize: true,
  });
  if (serialize) serializeConnection(ds, options);
  await ds.initialize();
  return { ds, items: ds.getRepository(ItemSchema) };
}

const insertSql = (id: string) =>
  `INSERT INTO items (id, label) VALUES ('${id}', '${id}')`;

const ids = async (ds: DataSource) => {
  const rows: { id: string }[] = await ds.query(
    'SELECT id FROM items ORDER BY id',
  );
  return rows.map((row) => row.id);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Request A runs a transaction that waits on I/O and then fails; request B saves an item while A
 * is waiting. B's save() resolves: its row must survive A's rollback.
 */
async function savedWhileAnotherRequestRollsBack(
  ds: DataSource,
  items: ReturnType<DataSource['getRepository']>,
) {
  const requestA = ds
    .transaction(async (manager) => {
      await manager.query(insertSql('from-a'));
      await sleep(30);
      throw new Error('request A fails');
    })
    .catch(() => undefined);
  await sleep(5);
  await items.save({ id: 'from-b', label: 'from-b' });
  await requestA;
}

describe('serializeConnection (convention sqlite-serialized-transactions)', () => {
  describe('with the serialized connection', () => {
    it('does not roll back a concurrent request write along with the failing transaction', async () => {
      const { ds, items } = await open(true);

      await savedWhileAnotherRequestRollsBack(ds, items);

      expect(await ids(ds)).toEqual(['from-b']);
      await ds.destroy();
    });

    it('keeps the writes of concurrent save() calls apart: only the failing one rolls back', async () => {
      const { ds, items } = await open(true);

      const results = await Promise.allSettled([
        // NOT NULL violation: this save()'s own implicit transaction rolls back.
        items.save({ id: 'bad', label: null } as unknown as Item),
        items.save({ id: 'f1', label: 'f1' }),
        items.save({ id: 'f2', label: 'f2' }),
      ]);

      expect(results.map((r) => r.status)).toEqual([
        'rejected',
        'fulfilled',
        'fulfilled',
      ]);
      expect(await ids(ds)).toEqual(['f1', 'f2']);
      await ds.destroy();
    });

    it('does not let a plain write join, then lose, another request transaction', async () => {
      const { ds } = await open(true);
      const runner = ds.createQueryRunner();
      await runner.startTransaction();
      await runner.query(insertSql('tx'));

      // A write made outside the transaction waits for it...
      const plain = ds.query(insertSql('plain'));
      await sleep(50);
      await runner.rollbackTransaction();
      await runner.release();
      await plain;

      // ...so the rollback does not undo it.
      expect(await ids(ds)).toEqual(['plain']);
      await ds.destroy();
    });

    it('does not keep the connection when SQLite rolled back by itself and ROLLBACK fails', async () => {
      const { ds } = await open(true);
      const runner = ds.createQueryRunner();
      await runner.startTransaction();
      // What disk-full or I/O errors do: the transaction is gone, COMMIT then ROLLBACK fail.
      (
        ds.driver as unknown as {
          databaseConnection: { exec(sql: string): void };
        }
      ).databaseConnection.exec('ROLLBACK');
      await expect(runner.commitTransaction()).rejects.toThrow(
        /no transaction is active/,
      );
      await expect(runner.rollbackTransaction()).rejects.toThrow(
        /no transaction is active/,
      );
      await runner.release();

      expect(await ds.query('SELECT 1 AS one')).toEqual([{ one: 1 }]);
      await ds.destroy();
    });

    it('lets a transaction run several statements and nest (savepoints for the owner)', async () => {
      const { ds } = await open(true);

      await ds.transaction(async (manager) => {
        await manager.query(insertSql('n1'));
        await manager.transaction((inner) => inner.query(insertSql('n2')));
      });

      expect(await ids(ds)).toEqual(['n1', 'n2']);
      await ds.destroy();
    });

    it('fails instead of hanging when a transaction is never closed', async () => {
      const { ds, items } = await open(true, { maxWaitMs: 100 });
      const runner = ds.createQueryRunner();
      await runner.startTransaction();

      await expect(items.save({ id: 'late', label: 'late' })).rejects.toThrow(
        /stayed inside another transaction/,
      );

      await runner.rollbackTransaction();
      await runner.release();
      await ds.destroy();
    });

    it('keeps a plain write out of a queued transaction even when a subscriber awaits before the statement', async () => {
      const { ds } = await open(true);
      // A legal `beforeQuery` subscriber that awaits (query timing, telemetry...) widens the window
      // between "the gate is free" and "the statement runs".
      ds.subscribers.push({
        beforeQuery: async (event) => {
          if (event.query.includes("'plain'")) await sleep(10);
        },
      });
      const owner = ds.createQueryRunner();
      await owner.startTransaction();
      await owner.query(insertSql('owner'));

      // Both wait for `owner`; the transaction then fails and rolls back whatever ran inside it.
      const plain = ds.query(insertSql('plain'));
      const failing = ds
        .transaction(async (manager) => {
          await manager.query(insertSql('tx'));
          await sleep(30);
          throw new Error('request fails');
        })
        .catch(() => undefined);
      await sleep(5);
      await owner.commitTransaction();
      await owner.release();
      await plain;
      await failing;

      expect(await ids(ds)).toEqual(['owner', 'plain']);
      await ds.destroy();
    });
  });

  describe('without it (documents the root cause)', () => {
    it('loses a write that save() reported as done', async () => {
      const { ds, items } = await open(false);

      await savedWhileAnotherRequestRollsBack(ds, items);

      // TypeORM's better-sqlite3 driver shares ONE query runner: B's save() sees the transaction
      // of A as its own, joins it, and A's rollback takes B's committed-looking row with it.
      // If this ever fails, TypeORM fixed the driver: the convention can be retired.
      expect(await ids(ds)).toEqual([]);
      await ds.destroy();
    });
  });
});
