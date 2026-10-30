import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tranche 3 (guidage prévisionnel) : paiements récurrents, épargne de sécurité du
 * foyer et profil fiscal du foyer.
 */
export class GuidagePrevisionnel1761955200000 implements MigrationInterface {
  name = 'GuidagePrevisionnel1761955200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "recurring_items" ("id" text PRIMARY KEY NOT NULL, "space_id" text NOT NULL, "kind" text NOT NULL, "bloc" text, "day_of_month" integer, "start_date" text NOT NULL, "end_date" text, "active" boolean NOT NULL, "aid_rule_id" text, "label" text, "amount_cents" integer, "secret_payload" text)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_recurring_items_space" ON "recurring_items" ("space_id")`,
    );
    await queryRunner.query(
      `CREATE TABLE "safety_nets" ("household_id" text PRIMARY KEY NOT NULL, "saved_cents" integer NOT NULL, "as_of" text NOT NULL, "target_months" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE TABLE "household_fiscal_profiles" ("household_id" text PRIMARY KEY NOT NULL, "children_under_six" integer NOT NULL, "dependent_children" integer NOT NULL, "first_year_home_services" boolean NOT NULL)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "household_fiscal_profiles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "safety_nets"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_recurring_items_space"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "recurring_items"`);
  }
}
