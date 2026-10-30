import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Espace commun : `label` et `amountCents` en clair.
 * Espace personnel : ils sont NULL et `secretPayload` contient {label, amountCents} chiffre.
 * `date` est un ISO 8601 UTC en texte (l'ordre lexicographique est l'ordre chronologique).
 */
@Entity({ name: 'transactions' })
@Index('idx_transactions_space_date', ['spaceId', 'date'])
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

  @Column({ type: 'text', nullable: true })
  label!: string | null;

  @Column({ type: 'integer', name: 'amount_cents', nullable: true })
  amountCents!: number | null;

  @Column({ type: 'text', name: 'secret_payload', nullable: true })
  secretPayload!: string | null;
}
