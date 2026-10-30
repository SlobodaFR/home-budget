import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Épargne de sécurité du foyer : une ligne par foyer. */
@Entity({ name: 'safety_nets' })
export class SafetyNetOrmEntity {
  @PrimaryColumn({ type: 'text', name: 'household_id' })
  householdId!: string;

  @Column({ type: 'integer', name: 'saved_cents' })
  savedCents!: number;

  @Column({ type: 'text', name: 'as_of' })
  asOf!: string;

  @Column({ type: 'integer', name: 'target_months' })
  targetMonths!: number;
}
