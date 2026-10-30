import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'spaces' })
export class SpaceOrmEntity {
  @PrimaryColumn('text')
  id!: string;

  @Index('idx_spaces_household')
  @Column({ type: 'text', name: 'household_id' })
  householdId!: string;

  @Column('text')
  kind!: string;

  @Column({ type: 'text', name: 'owner_user_id', nullable: true })
  ownerUserId!: string | null;

  @Column('text')
  name!: string;
}
