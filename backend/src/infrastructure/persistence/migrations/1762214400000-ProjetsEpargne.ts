import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tranche 6 : projets d'épargne par espace et leurs versements. Pas de clé
 * étrangère (le schéma n'en a pas) : la suppression d'un projet supprime ses
 * versements dans la même transaction applicative.
 */
export class ProjetsEpargne1762214400000 implements MigrationInterface {
  name = 'ProjetsEpargne1762214400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "projects" ("id" text PRIMARY KEY NOT NULL, "space_id" text NOT NULL, "kind" text NOT NULL, "target_date" text NOT NULL, "start_date" text NOT NULL, "archived" boolean NOT NULL, "account_id" text, "name" text, "target_cents" integer, "start_cents" integer, "secret_payload" text)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_projects_space" ON "projects" ("space_id")`,
    );
    await queryRunner.query(
      `CREATE TABLE "project_deposits" ("id" text PRIMARY KEY NOT NULL, "project_id" text NOT NULL, "space_id" text NOT NULL, "date" text NOT NULL, "amount_cents" integer, "note" text, "secret_payload" text)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_project_deposits_project" ON "project_deposits" ("project_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_project_deposits_space" ON "project_deposits" ("space_id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "project_deposits"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "projects"`);
  }
}
