import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Espace commun : `amountCents` et `note` en clair.
 * Espace personnel : ils sont NULL et `secretPayload` contient {amountCents, note} chiffré.
 * La date (AAAA-MM-JJ) reste en clair. Pas de clé étrangère (comme le reste du schéma) :
 * la suppression d'un projet supprime ses versements explicitement, dans une transaction.
 */
@Entity({ name: 'project_deposits' })
@Index('idx_project_deposits_project', ['projectId'])
@Index('idx_project_deposits_space', ['spaceId'])
export class ProjectDepositOrmEntity {
  @PrimaryColumn('text')
  id!: string;

  @Column({ type: 'text', name: 'project_id' })
  projectId!: string;

  @Column({ type: 'text', name: 'space_id' })
  spaceId!: string;

  @Column('text')
  date!: string;

  @Column({ type: 'integer', name: 'amount_cents', nullable: true })
  amountCents!: number | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ type: 'text', name: 'secret_payload', nullable: true })
  secretPayload!: string | null;
}
