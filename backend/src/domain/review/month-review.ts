import { DomainError } from '../shared/domain-error';

export const MAX_ANSWER_LENGTH = 500;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export type ReviewStatus = 'TODO' | 'DRAFT' | 'DONE';

export interface ReviewAnswers {
  /** Qu'est-ce qui s'est bien passé ? */
  wentWell: string;
  /** Qu'est-ce qui m'a surpris ? */
  surprise: string;
  /** La UNE chose décidée pour le mois suivant. */
  decision: string;
}

export interface MonthReviewProps {
  spaceId: string;
  /** AAAA-MM. */
  month: string;
  answers: ReviewAnswers;
  /** Non null = revue terminée (DONE). */
  completedAt: Date | null;
}

export const EMPTY_ANSWERS: ReviewAnswers = {
  wentWell: '',
  surprise: '',
  decision: '',
};

/**
 * Revue mensuelle d'un espace (rituel du cours) : trois réponses et une décision.
 * Le statut se déduit : DONE si terminée, DRAFT si des réponses existent, TODO sinon.
 */
export class MonthReview {
  private constructor(private readonly props: MonthReviewProps) {
    if (!MONTH_PATTERN.test(props.month)) {
      throw new DomainError('Mois invalide, format attendu : AAAA-MM');
    }
    for (const [key, label] of [
      ['wentWell', "Ce qui s'est bien passé"],
      ['surprise', 'Ce qui vous a surpris'],
      ['decision', 'La décision'],
    ] as const) {
      if (props.answers[key].length > MAX_ANSWER_LENGTH) {
        throw new DomainError(
          `${label} : ${MAX_ANSWER_LENGTH} caractères au plus`,
        );
      }
    }
    if (props.completedAt !== null && !props.answers.decision) {
      throw new DomainError(
        'Une revue terminée doit contenir une décision pour le mois suivant',
      );
    }
  }

  static create(props: MonthReviewProps): MonthReview {
    return new MonthReview({
      ...props,
      answers: {
        wentWell: props.answers.wentWell.trim(),
        surprise: props.answers.surprise.trim(),
        decision: props.answers.decision.trim(),
      },
    });
  }

  /**
   * Applique une sauvegarde : `complete: true` exige une décision non vide et fixe
   * `completedAt` (conservé s'il existe déjà) ; `complete: false` rouvre la revue
   * (brouillon). Renvoie null si tout est vide et non terminé : la revue retombe à TODO.
   */
  static save(
    spaceId: string,
    month: string,
    existing: MonthReview | null,
    answers: ReviewAnswers,
    complete: boolean,
    now: Date,
  ): MonthReview | null {
    const review = MonthReview.create({
      spaceId,
      month,
      answers,
      completedAt: complete ? (existing?.completedAt ?? now) : null,
    });
    return !complete && review.isEmpty() ? null : review;
  }

  get spaceId(): string {
    return this.props.spaceId;
  }

  get month(): string {
    return this.props.month;
  }

  get answers(): ReviewAnswers {
    return { ...this.props.answers };
  }

  get completedAt(): Date | null {
    return this.props.completedAt;
  }

  get status(): ReviewStatus {
    if (this.props.completedAt) {
      return 'DONE';
    }
    return this.isEmpty() ? 'TODO' : 'DRAFT';
  }

  isEmpty(): boolean {
    const { wentWell, surprise, decision } = this.props.answers;
    return !wentWell && !surprise && !decision;
  }
}
