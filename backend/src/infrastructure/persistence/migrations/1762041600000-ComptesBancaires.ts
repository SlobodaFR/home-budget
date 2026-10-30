import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tranche 4 : comptes bancaires par espace, et rattachement optionnel (`account_id`)
 * des opérations et des paiements récurrents.
 */
export class ComptesBancaires1762041600000 implements MigrationInterface {
  name = 'ComptesBancaires1762041600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "accounts" ("id" text PRIMARY KEY NOT NULL, "space_id" text NOT NULL, "kind" text NOT NULL, "opening_date" text NOT NULL, "archived" boolean NOT NULL, "name" text, "opening_balance_cents" integer, "secret_payload" text)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_accounts_space" ON "accounts" ("space_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN "account_id" text`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_transactions_account" ON "transactions" ("account_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "recurring_items" ADD COLUMN "account_id" text`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "recurring_items" DROP COLUMN "account_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_transactions_account"`);
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN "account_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_accounts_space"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "accounts"`);
  }
}
