import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Espace commun : `name` et `openingBalanceCents` en clair.
 * Espace personnel : ils sont NULL et `secretPayload` contient {name, openingBalanceCents} chiffré.
 * `openingDate` est un `AAAA-MM-JJ` en texte.
 */
@Entity({ name: 'accounts' })
@Index('idx_accounts_space', ['spaceId'])
export class AccountOrmEntity {
  @PrimaryColumn('text')
  id!: string;

  @Column({ type: 'text', name: 'space_id' })
  spaceId!: string;

  @Column('text')
  kind!: string;

  @Column({ type: 'text', name: 'opening_date' })
  openingDate!: string;

  @Column({ type: 'boolean' })
  archived!: boolean;

  @Column({ type: 'text', nullable: true })
  name!: string | null;

  @Column({ type: 'integer', name: 'opening_balance_cents', nullable: true })
  openingBalanceCents!: number | null;

  @Column({ type: 'text', name: 'secret_payload', nullable: true })
  secretPayload!: string | null;
}
