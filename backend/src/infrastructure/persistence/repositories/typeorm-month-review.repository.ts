import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MonthReview,
  ReviewAnswers,
} from '../../../domain/review/month-review';
import { MonthReviewRepository } from '../../../domain/review/month-review.repository';
import { FieldCipher } from '../../../domain/shared/field-cipher';
import { MonthReviewOrmEntity } from '../entities/month-review.orm-entity';
import { SpaceOrmEntity } from '../entities/space.orm-entity';

/**
 * Espace commun : réponses en clair. Espace personnel : les trois réponses sont
 * chiffrées ensemble (clé du propriétaire, AAD lié à la ligne : espace + mois).
 */
@Injectable()
export class TypeOrmMonthReviewRepository extends MonthReviewRepository {
  constructor(
    @InjectRepository(MonthReviewOrmEntity)
    private readonly reviews: Repository<MonthReviewOrmEntity>,
    @InjectRepository(SpaceOrmEntity)
    private readonly spaces: Repository<SpaceOrmEntity>,
    private readonly cipher: FieldCipher,
  ) {
    super();
  }

  async find(spaceId: string, month: string): Promise<MonthReview | null> {
    const row = await this.reviews.findOne({ where: { spaceId, month } });
    if (!row) {
      return null;
    }
    const space = await this.spaces.findOneByOrFail({ id: spaceId });
    return this.toDomain(row, space.ownerUserId);
  }

  async findBySpace(spaceId: string): Promise<MonthReview[]> {
    const space = await this.spaces.findOneByOrFail({ id: spaceId });
    const rows = await this.reviews.find({
      where: { spaceId },
      order: { month: 'DESC' },
    });
    return rows.map((row) => this.toDomain(row, space.ownerUserId));
  }

  async save(review: MonthReview): Promise<void> {
    const space = await this.spaces.findOneByOrFail({ id: review.spaceId });
    const base = {
      spaceId: review.spaceId,
      month: review.month,
      completedAt: review.completedAt ? review.completedAt.toISOString() : null,
    };
    if (space.ownerUserId) {
      await this.reviews.save({
        ...base,
        wentWell: null,
        surprise: null,
        decision: null,
        secretPayload: this.cipher.encrypt(
          space.ownerUserId,
          aad(review.spaceId, review.month),
          JSON.stringify(review.answers),
        ),
      });
      return;
    }
    const { wentWell, surprise, decision } = review.answers;
    await this.reviews.save({
      ...base,
      wentWell,
      surprise,
      decision,
      secretPayload: null,
    });
  }

  async delete(spaceId: string, month: string): Promise<void> {
    await this.reviews.delete({ spaceId, month });
  }

  private toDomain(
    row: MonthReviewOrmEntity,
    ownerUserId: string | null,
  ): MonthReview {
    let answers: ReviewAnswers = {
      wentWell: row.wentWell ?? '',
      surprise: row.surprise ?? '',
      decision: row.decision ?? '',
    };
    if (ownerUserId && row.secretPayload) {
      answers = JSON.parse(
        this.cipher.decrypt(
          ownerUserId,
          aad(row.spaceId, row.month),
          row.secretPayload,
        ),
      ) as ReviewAnswers;
    }
    return MonthReview.create({
      spaceId: row.spaceId,
      month: row.month,
      answers,
      completedAt: row.completedAt ? new Date(row.completedAt) : null,
    });
  }
}

function aad(spaceId: string, month: string): string {
  return `rev:${spaceId}:${month}`;
}
