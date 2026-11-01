import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Espace commun : nom, montants et taux en clair.
 * Espace personnel : ils sont NULL et `secretPayload` contient le tout chiffré.
 * Type, date de début, jour de prélèvement, archivage et paiement récurrent restent en clair,
 * ainsi que (tranche 12) le type de taux, le mode d'assurance et le type de garantie.
 * Prêteur, référence, durée, taux d'assurance, quotité, frais, montant de garantie et notes
 * suivent le nom : en clair dans le commun, NULL + `secretPayload` dans le personnel.
 * Une valeur NULL en lecture vaut le défaut du contrat (crédits d'avant la tranche 12).
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

  @Column({ type: 'text', name: 'lender', nullable: true })
  lender!: string | null;

  @Column({ type: 'text', name: 'contract_reference', nullable: true })
  contractReference!: string | null;

  @Column({ type: 'integer', name: 'initial_term_months', nullable: true })
  initialTermMonths!: number | null;

  @Column({ type: 'text', name: 'rate_type', nullable: true })
  rateType!: string | null;

  @Column({ type: 'text', name: 'insurance_mode', nullable: true })
  insuranceMode!: string | null;

  @Column({
    type: 'integer',
    name: 'insurance_rate_hundredths',
    nullable: true,
  })
  insuranceRateHundredths!: number | null;

  @Column({
    type: 'integer',
    name: 'insurance_quotity_percent',
    nullable: true,
  })
  insuranceQuotityPercent!: number | null;

  @Column({ type: 'integer', name: 'fees_cents', nullable: true })
  feesCents!: number | null;

  @Column({ type: 'text', name: 'guarantee_kind', nullable: true })
  guaranteeKind!: string | null;

  @Column({ type: 'integer', name: 'guarantee_cents', nullable: true })
  guaranteeCents!: number | null;

  @Column({ type: 'text', name: 'notes', nullable: true })
  notes!: string | null;
}
