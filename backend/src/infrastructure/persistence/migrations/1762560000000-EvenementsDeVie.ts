import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tranche 11 : événements de vie du foyer. Deux tables : `life_events` (une ligne par
 * événement, rattaché à `household_id`) et `life_event_steps` (l'état fait/note des seules
 * étapes cochées ou annotées, clé primaire composite). Les étapes elles-mêmes viennent du
 * catalogue versionné dans le code : ajouter ou retirer une étape ne demande aucune migration.
 */
export class EvenementsDeVie1762560000000 implements MigrationInterface {
  name = 'EvenementsDeVie1762560000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "life_events" ("id" text PRIMARY KEY NOT NULL, "household_id" text NOT NULL, "type" text NOT NULL, "label" text NOT NULL, "event_date" text NOT NULL, "created_at" text NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_life_events_household" ON "life_events" ("household_id")`,
    );
    await queryRunner.query(
      `CREATE TABLE "life_event_steps" ("event_id" text NOT NULL, "step_id" text NOT NULL, "done_at" text, "note" text NOT NULL, PRIMARY KEY ("event_id", "step_id"))`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "life_event_steps"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_life_events_household"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "life_events"`);
  }
}
