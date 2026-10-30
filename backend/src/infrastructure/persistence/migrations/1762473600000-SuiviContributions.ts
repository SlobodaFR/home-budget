import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tranche 10 : suivi des contributions au foyer. Deux colonnes nullables sur les
 * opérations (le membre qui a versé et le mois couvert, AAAA-MM) et un index pour la
 * somme par membre et par mois. Les lignes existantes restent à NULL.
 */
export class SuiviContributions1762473600000 implements MigrationInterface {
  name = 'SuiviContributions1762473600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN "contribution_user_id" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN "contribution_month" text`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_transactions_contribution" ON "transactions" ("space_id", "contribution_month", "contribution_user_id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_transactions_contribution"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN "contribution_month"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN "contribution_user_id"`,
    );
  }
}
