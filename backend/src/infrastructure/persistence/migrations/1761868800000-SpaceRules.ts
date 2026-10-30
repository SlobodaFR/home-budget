import { MigrationInterface, QueryRunner } from 'typeorm';

/** Regles de classement des releves importes, par espace. */
export class SpaceRules1761868800000 implements MigrationInterface {
  name = 'SpaceRules1761868800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "space_rules" ("space_id" text PRIMARY KEY NOT NULL, "payload" text NOT NULL)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "space_rules"`);
  }
}
