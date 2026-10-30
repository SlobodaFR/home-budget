import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Espace commun : `label` et `amountCents` en clair.
 * Espace personnel : ils sont NULL et `secretPayload` contient {label, amountCents} chiffré
 * (comme pour les opérations). Les dates sont des `AAAA-MM-JJ` en texte.
 */
@Entity({ name: 'recurring_items' })
@Index('idx_recurring_items_space', ['spaceId'])
export class RecurringItemOrmEntity {
  @PrimaryColumn('text')
  id!: string;

  @Column({ type: 'text', name: 'space_id' })
  spaceId!: string;

  @Column('text')
  kind!: string;

  @Column({ type: 'text', nullable: true })
  bloc!: string | null;

  @Column({ type: 'integer', name: 'day_of_month', nullable: true })
  dayOfMonth!: number | null;

  @Column({ type: 'text', name: 'start_date' })
  startDate!: string;

  @Column({ type: 'text', name: 'end_date', nullable: true })
  endDate!: string | null;

  @Column({ type: 'boolean' })
  active!: boolean;

  @Column({ type: 'text', name: 'aid_rule_id', nullable: true })
  aidRuleId!: string | null;

  @Column({ type: 'text', default: 'MONTHLY' })
  frequency!: string;

  @Column({ type: 'integer', name: 'month_of_year', nullable: true })
  monthOfYear!: number | null;

  @Column({ type: 'text', name: 'account_id', nullable: true })
  accountId!: string | null;

  @Column({ type: 'text', nullable: true })
  label!: string | null;

  @Column({ type: 'integer', name: 'amount_cents', nullable: true })
  amountCents!: number | null;

  @Column({ type: 'text', name: 'secret_payload', nullable: true })
  secretPayload!: string | null;
}
