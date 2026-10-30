import { isIsoDate } from '../shared/calendar';
import { DomainError } from '../shared/domain-error';

export const MIN_TARGET_MONTHS = 1;
export const MAX_TARGET_MONTHS = 24;

export interface SafetyNetProps {
  /** Montant disponible à la date `asOf`, en centimes. */
  savedCents: number;
  /** AAAA-MM-JJ. */
  asOf: string;
  /** Nombre de mois de dépenses visé (1 à 24). */
  targetMonths: number;
}

/** Épargne de sécurité du foyer (leçon 2 du cours) : déclarée par les membres. */
export class SafetyNet {
  private constructor(private readonly props: SafetyNetProps) {
    if (!Number.isInteger(props.savedCents) || props.savedCents < 0) {
      throw new DomainError(
        'Le montant épargné doit être un entier positif ou nul (en centimes)',
      );
    }
    if (!isIsoDate(props.asOf)) {
      throw new DomainError('Date invalide, format attendu : AAAA-MM-JJ');
    }
    if (
      !Number.isInteger(props.targetMonths) ||
      props.targetMonths < MIN_TARGET_MONTHS ||
      props.targetMonths > MAX_TARGET_MONTHS
    ) {
      throw new DomainError(
        `La cible doit être un entier de ${MIN_TARGET_MONTHS} à ${MAX_TARGET_MONTHS} mois`,
      );
    }
  }

  static create(props: SafetyNetProps): SafetyNet {
    return new SafetyNet({ ...props });
  }

  get savedCents(): number {
    return this.props.savedCents;
  }

  get asOf(): string {
    return this.props.asOf;
  }

  get targetMonths(): number {
    return this.props.targetMonths;
  }

  toProps(): SafetyNetProps {
    return { ...this.props };
  }
}
