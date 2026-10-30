import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Espace commun : `label` et `amountCents` en clair.
 * Espace personnel : ils sont NULL et `secretPayload` contient {label, amountCents} chiffre.
 * `contributionUserId` / `contributionMonth` : en clair (ils ne concernent que des revenus
 * du commun) ; aucun lien vers l'éventuelle dépense de l'espace personnel.
 * `date` est un ISO 8601 UTC en texte (l'ordre lexicographique est l'ordre chronologique).
 */
@Entity({ name: 'transactions' })
@Index('idx_transactions_space_date', ['spaceId', 'date'])
@Index('idx_transactions_account', ['accountId'])
@Index('idx_transactions_contribution', [
  'spaceId',
  'contributionMonth',
  'contributionUserId',
])
export class TransactionOrmEntity {
  @PrimaryColumn('text')
  id!: string;

  @Column({ type: 'text', name: 'space_id' })
  spaceId!: string;

  @Column('text')
  kind!: string;

  @Column({ type: 'text', nullable: true })
  bloc!: string | null;

  @Column('text')
  date!: string;

  @Column({ type: 'text', name: 'account_id', nullable: true })
  accountId!: string | null;

  @Column({ type: 'text', name: 'contribution_user_id', nullable: true })
  contributionUserId!: string | null;

  @Column({ type: 'text', name: 'contribution_month', nullable: true })
  contributionMonth!: string | null;

  @Column({ type: 'text', nullable: true })
  label!: string | null;

  @Column({ type: 'integer', name: 'amount_cents', nullable: true })
  amountCents!: number | null;

  @Column({ type: 'text', name: 'secret_payload', nullable: true })
  secretPayload!: string | null;
}
