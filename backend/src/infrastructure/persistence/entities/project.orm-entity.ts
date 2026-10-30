import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Espace commun : `name`, `targetCents` et `startCents` en clair.
 * Espace personnel : ils sont NULL et `secretPayload` contient {name, targetCents, startCents} chiffré.
 * Type, dates (AAAA-MM-JJ), archivage et compte restent en clair.
 */
@Entity({ name: 'projects' })
@Index('idx_projects_space', ['spaceId'])
export class ProjectOrmEntity {
  @PrimaryColumn('text')
  id!: string;

  @Column({ type: 'text', name: 'space_id' })
  spaceId!: string;

  @Column('text')
  kind!: string;

  @Column({ type: 'text', name: 'target_date' })
  targetDate!: string;

  @Column({ type: 'text', name: 'start_date' })
  startDate!: string;

  @Column({ type: 'boolean' })
  archived!: boolean;

  @Column({ type: 'text', name: 'account_id', nullable: true })
  accountId!: string | null;

  @Column({ type: 'text', nullable: true })
  name!: string | null;

  @Column({ type: 'integer', name: 'target_cents', nullable: true })
  targetCents!: number | null;

  @Column({ type: 'integer', name: 'start_cents', nullable: true })
  startCents!: number | null;

  @Column({ type: 'text', name: 'secret_payload', nullable: true })
  secretPayload!: string | null;
}
