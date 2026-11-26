import { DataSource } from 'typeorm';
import type { DataSourceOptions } from 'typeorm';
import { BetterSqlite3QueryRunner } from 'typeorm/driver/better-sqlite3/BetterSqlite3QueryRunner.js';
import type { BetterSqlite3Driver } from 'typeorm/driver/better-sqlite3/BetterSqlite3Driver.js';
import type { IsolationLevel } from 'typeorm/driver/types/IsolationLevel.js';

// Reference file of the harness convention `sqlite-serialized-transactions` (home-features #57, #79):
// copy VERBATIM into backend/src/infrastructure/persistence/. Works on TypeORM 0.3.x and 1.1.x.

// Bounded by time, not by event-loop turns. Default; tune per service at the call site, never by
// editing this file (the audit compares it byte for byte).
const DEFAULT_MAX_WAIT_MS = 5_000;

export interface SerializeOptions {
  /** Longest a query or a transaction waits for another transaction to end. Default 5 s. */
  maxWaitMs?: number;
}

/**
 * Who currently owns the SQLite connection for a transaction. One owner at a time; the owner
 * (a query runner) may nest as many savepoints as it wants.
 */
class ConnectionGate {
  private owner: BetterSqlite3QueryRunner | null = null;
  private readonly waiting = new Set<() => void>();

  constructor(private readonly maxWaitMs: number) {}

  acquire(runner: BetterSqlite3QueryRunner): Promise<void> {
    // The ownership is taken in the same turn as the wake-up: two waiters cannot both get it.
    return this.waitUntil(
      () => this.owner === null || this.owner === runner,
      () => {
        this.owner = runner;
      },
    );
  }

  release(runner: BetterSqlite3QueryRunner): void {
    if (this.owner !== runner) return;
    this.owner = null;
    for (const wake of this.waiting) wake();
  }

  private waitUntil(isFree: () => boolean, take?: () => void): Promise<void> {
    if (isFree()) {
      take?.();
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const wake = () => {
        if (!isFree()) return;
        take?.();
        cleanup();
        resolve();
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `The database stayed inside another transaction (or the queue of waiting requests is longer than ${this.maxWaitMs} ms)`,
          ),
        );
      }, this.maxWaitMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.waiting.delete(wake);
      };
      this.waiting.add(wake);
    });
  }
}

class SerializedQueryRunner extends BetterSqlite3QueryRunner {
  constructor(
    driver: BetterSqlite3Driver,
    private readonly gate: ConnectionGate,
  ) {
    super(driver);
  }

  // TypeORM always releases its runner in a finally, even when ROLLBACK itself failed (SQLite
  // already rolled back on disk-full / I/O errors): never keep the gate for a discarded runner.
  override async release(): Promise<void> {
    this.gate.release(this);
    return super.release();
  }

  override async startTransaction(
    isolationLevel?: IsolationLevel,
  ): Promise<void> {
    await this.gate.acquire(this);
    try {
      await super.startTransaction(isolationLevel);
    } finally {
      this.releaseIfIdle();
    }
  }

  override async commitTransaction(): Promise<void> {
    try {
      await super.commitTransaction();
    } finally {
      this.releaseIfIdle();
    }
  }

  override async rollbackTransaction(): Promise<void> {
    try {
      await super.rollbackTransaction();
    } finally {
      this.releaseIfIdle();
    }
  }

  override async query(
    query: string,
    parameters?: any[],
    useStructuredResult?: boolean,
  ): Promise<any> {
    // Inside our own transaction (BEGIN, savepoints, COMMIT included): the gate is already ours.
    if (this.isTransactionActive) {
      return super.query(query, parameters, useStructuredResult);
    }
    // Outside any transaction: take the gate for the statement itself. Merely waiting for it to be
    // free is not enough: another runner could BEGIN between the wake-up and the statement (a
    // `beforeQuery` subscriber that awaits widens that window), and the write would join its
    // transaction and be rolled back with it. better-sqlite3 is synchronous: holding costs nothing.
    await this.gate.acquire(this);
    try {
      return await super.query(query, parameters, useStructuredResult);
    } finally {
      this.releaseIfIdle();
    }
  }

  // After a failed COMMIT TypeORM still has to ROLLBACK: keep the connection until then.
  private releaseIfIdle(): void {
    if (!this.isTransactionActive) this.gate.release(this);
  }
}

/**
 * TypeORM's better-sqlite3 driver hands every caller the same query runner, so concurrent requests
 * share one `isTransactionActive` / savepoint depth on one connection: a `repository.save()` of
 * request B joins the transaction of request A (and is rolled back with it), or commits it
 * early (home-features #57). This gives each caller its own query runner and lets only one of them hold a
 * transaction at a time; every other query waits for it to end. Call it before `initialize()`.
 *
 * Do not use the DataSource (or another runner) from inside a transaction callback: it would wait
 * for that very transaction. Use the callback's own `manager`. A runner you create by hand must
 * always be `release()`d in a `finally`. Reads wait for a running transaction too: keep transactions
 * short (no network call inside), or raise `maxWaitMs` for that service.
 */
export function serializeConnection(
  dataSource: DataSource,
  { maxWaitMs = DEFAULT_MAX_WAIT_MS }: SerializeOptions = {},
): void {
  const driver = dataSource.driver as BetterSqlite3Driver;
  const gate = new ConnectionGate(maxWaitMs);
  driver.createQueryRunner = () => new SerializedQueryRunner(driver, gate);
}

/** `dataSourceFactory` for TypeOrmModule: serialized before initialize(), so migrations too. */
export async function serializedDataSourceFactory(
  options?: DataSourceOptions,
): Promise<DataSource> {
  const dataSource = new DataSource(options!);
  serializeConnection(dataSource);
  return dataSource.initialize();
}

/** Same factory with another wait bound: `dataSourceFactory: serializedDataSourceFactoryWith({ maxWaitMs })`. */
export const serializedDataSourceFactoryWith =
  (serializeOptions: SerializeOptions) =>
  async (options?: DataSourceOptions): Promise<DataSource> => {
    const dataSource = new DataSource(options!);
    serializeConnection(dataSource, serializeOptions);
    return dataSource.initialize();
  };
