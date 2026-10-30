import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tranche 5 : périodicité des paiements récurrents (mensuel par défaut, trimestriel,
 * annuel) et mois de l'année de l'échéance. Les lignes existantes deviennent MONTHLY.
 */
export class PaiementsNonMensuels1762128000000 implements MigrationInterface {
  name = 'PaiementsNonMensuels1762128000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "recurring_items" ADD COLUMN "frequency" text NOT NULL DEFAULT ('MONTHLY')`,
    );
    await queryRunner.query(
      `ALTER TABLE "recurring_items" ADD COLUMN "month_of_year" integer`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "recurring_items" DROP COLUMN "month_of_year"`,
    );
    await queryRunner.query(
      `ALTER TABLE "recurring_items" DROP COLUMN "frequency"`,
    );
  }
}
