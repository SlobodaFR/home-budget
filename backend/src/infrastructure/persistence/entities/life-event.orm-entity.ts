import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Événement de vie d'un foyer (naissance…). Données en clair : elles sont visibles de tous
 * les membres et ne doivent contenir aucune donnée sensible. `eventDate` est `AAAA-MM-JJ`.
 */
@Entity({ name: 'life_events' })
@Index('idx_life_events_household', ['householdId'])
export class LifeEventOrmEntity {
  @PrimaryColumn('text')
  id!: string;

  @Column({ type: 'text', name: 'household_id' })
  householdId!: string;

  @Column('text')
  type!: string;

  @Column('text')
  label!: string;

  @Column({ type: 'text', name: 'event_date' })
  eventDate!: string;

  @Column({ type: 'text', name: 'created_at' })
  createdAt!: string;
}
