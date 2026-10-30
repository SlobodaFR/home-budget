import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Une revue par (espace, mois) : clé primaire composite (donc unique).
 * Espace commun : `wentWell`, `surprise` et `decision` en clair.
 * Espace personnel : ils sont NULL et `secretPayload` contient les trois réponses chiffrées.
 * `completedAt` (ISO 8601 UTC) est en clair : non nul = revue terminée.
 */
@Entity({ name: 'month_reviews' })
export class MonthReviewOrmEntity {
  @PrimaryColumn({ type: 'text', name: 'space_id' })
  spaceId!: string;

  @PrimaryColumn('text')
  month!: string;

  @Column({ type: 'text', name: 'completed_at', nullable: true })
  completedAt!: string | null;

  @Column({ type: 'text', name: 'went_well', nullable: true })
  wentWell!: string | null;

  @Column({ type: 'text', nullable: true })
  surprise!: string | null;

  @Column({ type: 'text', nullable: true })
  decision!: string | null;

  @Column({ type: 'text', name: 'secret_payload', nullable: true })
  secretPayload!: string | null;
}
