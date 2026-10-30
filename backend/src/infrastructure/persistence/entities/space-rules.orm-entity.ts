import { Column, Entity, PrimaryColumn } from 'typeorm';

/** `payload` : JSON des regles de classement ; chiffre (v1.…) pour un espace personnel. */
@Entity({ name: 'space_rules' })
export class SpaceRulesOrmEntity {
  @PrimaryColumn({ type: 'text', name: 'space_id' })
  spaceId!: string;

  @Column('text')
  payload!: string;
}
