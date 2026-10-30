import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'households' })
export class HouseholdOrmEntity {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  name!: string;

  @Column({ type: 'text', name: 'contribution_mode' })
  contributionMode!: string;

  @Column({ type: 'text', name: 'created_at' })
  createdAt!: string;
}
