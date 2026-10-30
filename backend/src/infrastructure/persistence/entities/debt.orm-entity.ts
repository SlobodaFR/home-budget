import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Espace commun : nom, montants et taux en clair.
 * Espace personnel : ils sont NULL et `secretPayload` contient le tout chiffré.
 * Type, date de début, jour de prélèvement, archivage et paiement récurrent restent en clair.
 */
@Entity({ name: 'debts' })
@Index('idx_debts_space', ['spaceId'])
export class DebtOrmEntity {
  @PrimaryColumn('text')
  id!: string;

  @Column({ type: 'text', name: 'space_id' })
  spaceId!: string;

  @Column('text')
  kind!: string;

  @Column({ type: 'text', name: 'start_date' })
  startDate!: string;

  @Column({ type: 'integer', name: 'payment_day' })
  paymentDay!: number;

  @Column({ type: 'boolean' })
  archived!: boolean;

  @Column({ type: 'text', name: 'recurring_id', nullable: true })
  recurringId!: string | null;

  @Column({ type: 'text', nullable: true })
  name!: string | null;

  @Column({ type: 'integer', name: 'principal_cents', nullable: true })
  principalCents!: number | null;

  @Column({ type: 'integer', name: 'remaining_cents', nullable: true })
  remainingCents!: number | null;

  @Column({ type: 'integer', name: 'annual_rate_hundredths', nullable: true })
  annualRateHundredths!: number | null;

  @Column({ type: 'integer', name: 'monthly_payment_cents', nullable: true })
  monthlyPaymentCents!: number | null;

  @Column({ type: 'integer', name: 'insurance_monthly_cents', nullable: true })
  insuranceMonthlyCents!: number | null;

  @Column({ type: 'text', name: 'secret_payload', nullable: true })
  secretPayload!: string | null;
}
