import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schema du modele foyer / espaces / blocs. L'ancien modele (comptes, operations,
 * recurrents) est conserve sous le prefixe `legacy_` plutot que supprime.
 */
export class FoyerSchema1761782400000 implements MigrationInterface {
  name = 'FoyerSchema1761782400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'transactions',
      'accounts',
      'recurring_transactions',
    ]) {
      if (await this.isLegacy(queryRunner, table)) {
        await queryRunner.query(
          `ALTER TABLE "${table}" RENAME TO "legacy_${table}"`,
        );
      }
    }

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "users" ("id" text PRIMARY KEY NOT NULL, "email" text NOT NULL, "name" text NOT NULL, "avatar_url" text NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_users_email" ON "users" ("email")`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "revoked_sessions" ("user_id" text PRIMARY KEY NOT NULL, "revoked_at" datetime NOT NULL)`,
    );

    await queryRunner.query(
      `CREATE TABLE "households" ("id" text PRIMARY KEY NOT NULL, "name" text NOT NULL, "contribution_mode" text NOT NULL, "created_at" text NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE TABLE "memberships" ("household_id" text NOT NULL, "user_id" text NOT NULL, "role" text NOT NULL, "net_monthly_income_cents" integer, "joined_at" text NOT NULL, PRIMARY KEY ("household_id", "user_id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_memberships_user" ON "memberships" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE TABLE "invitations" ("code" text PRIMARY KEY NOT NULL, "household_id" text NOT NULL, "created_by" text NOT NULL, "expires_at" text NOT NULL, "used_at" text, "used_by" text)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_invitations_household" ON "invitations" ("household_id")`,
    );
    await queryRunner.query(
      `CREATE TABLE "spaces" ("id" text PRIMARY KEY NOT NULL, "household_id" text NOT NULL, "kind" text NOT NULL, "owner_user_id" text, "name" text NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_spaces_household" ON "spaces" ("household_id")`,
    );
    await queryRunner.query(
      `CREATE TABLE "space_plans" ("space_id" text PRIMARY KEY NOT NULL, "payload" text NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE TABLE "transactions" ("id" text PRIMARY KEY NOT NULL, "space_id" text NOT NULL, "kind" text NOT NULL, "bloc" text, "date" text NOT NULL, "label" text, "amount_cents" integer, "secret_payload" text)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_transactions_space_date" ON "transactions" ("space_id", "date")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'transactions',
      'space_plans',
      'spaces',
      'invitations',
      'memberships',
      'households',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}"`);
    }
    for (const table of [
      'transactions',
      'accounts',
      'recurring_transactions',
    ]) {
      const legacy = (await queryRunner.query(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'legacy_${table}'`,
      )) as unknown[];
      if (legacy.length > 0) {
        await queryRunner.query(
          `ALTER TABLE "legacy_${table}" RENAME TO "${table}"`,
        );
      }
    }
  }

  /** Vrai si `table` existe avec l'ancien schema (colonne account_id ou user_id). */
  private async isLegacy(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `SELECT name FROM pragma_table_info('${table}')`,
    )) as { name: string }[];
    return rows.some(
      (row) => row.name === 'account_id' || row.name === 'user_id',
    );
  }
}
