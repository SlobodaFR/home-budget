import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'invitations' })
export class InvitationOrmEntity {
  @PrimaryColumn('text')
  code!: string;

  @Index('idx_invitations_household')
  @Column({ type: 'text', name: 'household_id' })
  householdId!: string;

  @Column({ type: 'text', name: 'created_by' })
  createdBy!: string;

  @Column({ type: 'text', name: 'expires_at' })
  expiresAt!: string;

  @Column({ type: 'text', name: 'used_at', nullable: true })
  usedAt!: string | null;

  @Column({ type: 'text', name: 'used_by', nullable: true })
  usedBy!: string | null;
}
