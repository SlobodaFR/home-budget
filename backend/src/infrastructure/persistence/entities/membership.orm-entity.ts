import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'memberships' })
export class MembershipOrmEntity {
  @PrimaryColumn({ type: 'text', name: 'household_id' })
  householdId!: string;

  /** Un utilisateur n'appartient qu'a un seul foyer. */
  @Index('uq_memberships_user', { unique: true })
  @PrimaryColumn({ type: 'text', name: 'user_id' })
  userId!: string;

  @Column('text')
  role!: string;

  @Column({ type: 'integer', name: 'net_monthly_income_cents', nullable: true })
  netMonthlyIncomeCents!: number | null;

  @Column({ type: 'text', name: 'joined_at' })
  joinedAt!: string;
}
