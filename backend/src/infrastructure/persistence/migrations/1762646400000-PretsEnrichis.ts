import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tranche 12 : prêts enrichis. Onze colonnes nullables sur `debts` (prêteur, référence,
 * durée initiale, type de taux, assurance détaillée, frais, garantie, notes). Les crédits
 * existants gardent toutes leurs données : une valeur NULL est lue comme le défaut du
 * contrat (prêteur '', durée inconnue, type de taux inconnu, assurance FIXED, quotité 100,
 * frais 0, garantie NONE/0, notes ''). Dans un espace personnel, les valeurs sensibles vivent
 * dans `secret_payload` et ces colonnes restent NULL.
 */
export class PretsEnrichis1762646400000 implements MigrationInterface {
  name = 'PretsEnrichis1762646400000';

  private static readonly COLUMNS: [string, string][] = [
    ['lender', 'text'],
    ['contract_reference', 'text'],
    ['initial_term_months', 'integer'],
    ['rate_type', 'text'],
    ['insurance_mode', 'text'],
    ['insurance_rate_hundredths', 'integer'],
    ['insurance_quotity_percent', 'integer'],
    ['fees_cents', 'integer'],
    ['guarantee_kind', 'text'],
    ['guarantee_cents', 'integer'],
    ['notes', 'text'],
  ];

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const [name, type] of PretsEnrichis1762646400000.COLUMNS) {
      await queryRunner.query(
        `ALTER TABLE "debts" ADD COLUMN "${name}" ${type}`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const [name] of [...PretsEnrichis1762646400000.COLUMNS].reverse()) {
      await queryRunner.query(`ALTER TABLE "debts" DROP COLUMN "${name}"`);
    }
  }
}
