import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * État d'une étape d'un événement : une ligne par (événement, étape du catalogue),
 * clé primaire composite. Seules les étapes cochées ou annotées ont une ligne ; les
 * étapes elles-mêmes ne sont jamais stockées (elles viennent du catalogue). `doneAt`
 * (ISO 8601 UTC) NULL = pas faite.
 */
@Entity({ name: 'life_event_steps' })
export class LifeEventStepOrmEntity {
  @PrimaryColumn({ type: 'text', name: 'event_id' })
  eventId!: string;

  @PrimaryColumn({ type: 'text', name: 'step_id' })
  stepId!: string;

  @Column({ type: 'text', name: 'done_at', nullable: true })
  doneAt!: string | null;

  @Column('text')
  note!: string;
}
