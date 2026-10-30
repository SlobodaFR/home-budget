import { Column, Entity, PrimaryColumn } from 'typeorm';

/** `payload` : JSON du plan ; chiffre (v1.…) pour un espace personnel. */
@Entity({ name: 'space_plans' })
export class SpacePlanOrmEntity {
  @PrimaryColumn({ type: 'text', name: 'space_id' })
  spaceId!: string;

  @Column('text')
  payload!: string;
}
