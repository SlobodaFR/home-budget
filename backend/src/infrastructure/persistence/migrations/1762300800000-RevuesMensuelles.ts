import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tranche 7 : revue mensuelle par espace. Une ligne par (espace, mois) : la clé
 * primaire composite porte l'unicité.
 */
export class RevuesMensuelles1762300800000 implements MigrationInterface {
  name = 'RevuesMensuelles1762300800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "month_reviews" ("space_id" text NOT NULL, "month" text NOT NULL, "completed_at" text, "went_well" text, "surprise" text, "decision" text, "secret_payload" text, PRIMARY KEY ("space_id", "month"))`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "month_reviews"`);
  }
}
