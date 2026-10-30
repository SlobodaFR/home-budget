import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity({ name: 'users' })
export class UserOrmEntity {
  @PrimaryColumn('text')
  id!: string;

  @Index('uq_users_email', { unique: true })
  @Column('text')
  email!: string;

  @Column('text')
  name!: string;

  @Column({ type: 'text', name: 'avatar_url' })
  avatarUrl!: string;

  @CreateDateColumn({ type: 'datetime', name: 'created_at' })
  createdAt!: Date;
}
