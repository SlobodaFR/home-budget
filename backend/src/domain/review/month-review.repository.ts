import { MonthReview } from './month-review';

/**
 * Port (driven side). Une revue par (espace, mois). Les réponses d'un espace
 * personnel sont chiffrées par l'infrastructure. Une revue TODO n'est jamais stockée.
 */
export abstract class MonthReviewRepository {
  abstract find(spaceId: string, month: string): Promise<MonthReview | null>;
  /** Les revues de l'espace, la plus récente (mois) d'abord. */
  abstract findBySpace(spaceId: string): Promise<MonthReview[]>;
  abstract save(review: MonthReview): Promise<void>;
  abstract delete(spaceId: string, month: string): Promise<void>;
}
