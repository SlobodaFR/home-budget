import { MigrationInterface, QueryRunner } from 'typeorm';

/** Tranche 8 : crédits (dettes) par espace. Le taux est stocké en centièmes de pourcent entiers. */
export class CreditsDettes1762387200000 implements MigrationInterface {
  name = 'CreditsDettes1762387200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "debts" ("id" text PRIMARY KEY NOT NULL, "space_id" text NOT NULL, "kind" text NOT NULL, "start_date" text NOT NULL, "payment_day" integer NOT NULL, "archived" boolean NOT NULL, "recurring_id" text, "name" text, "principal_cents" integer, "remaining_cents" integer, "annual_rate_hundredths" integer, "monthly_payment_cents" integer, "insurance_monthly_cents" integer, "secret_payload" text)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_debts_space" ON "debts" ("space_id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "debts"`);
  }
}
