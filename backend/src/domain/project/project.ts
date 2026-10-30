import { isIsoDate } from '../shared/calendar';
import { DomainError } from '../shared/domain-error';

export const PROJECT_KINDS = [
  'GENERIC',
  'BABY',
  'HOLIDAY',
  'PURCHASE',
  'HOME',
  'EDUCATION',
  'OTHER',
] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

export const MAX_PROJECT_NAME_LENGTH = 80;
/** Garde-fou : 10 milliards d'euros en centimes. */
export const MAX_PROJECT_CENTS = 1_000_000_000_000;

export interface ProjectProps {
  id: string;
  spaceId: string;
  name: string;
  kind: ProjectKind;
  /** Objectif en centimes, entier > 0. */
  targetCents: number;
  /** AAAA-MM-JJ, postérieure à `startDate`. */
  targetDate: string;
  /** Déjà épargné à `startDate`, entier >= 0. */
  startCents: number;
  /** AAAA-MM-JJ. */
  startDate: string;
  archived: boolean;
  /** Compte de l'espace (ex. un livret) ; null = aucun. */
  accountId: string | null;
}

/**
 * Objectif d'épargne daté (naissance, vacances, voiture, travaux…), alimenté par
 * des versements. Il rend concret le bloc EPARGNE du plan.
 */
export class Project {
  private constructor(private readonly props: ProjectProps) {
    const name = props.name.trim();
    if (!name) {
      throw new DomainError('Le nom du projet ne doit pas être vide');
    }
    if (name.length > MAX_PROJECT_NAME_LENGTH) {
      throw new DomainError(
        `Nom du projet trop long (${MAX_PROJECT_NAME_LENGTH} caractères)`,
      );
    }
    if (!(PROJECT_KINDS as readonly string[]).includes(props.kind)) {
      throw new DomainError(
        `Type de projet invalide : ${PROJECT_KINDS.join(', ')}`,
      );
    }
    if (
      !Number.isInteger(props.targetCents) ||
      props.targetCents <= 0 ||
      props.targetCents > MAX_PROJECT_CENTS
    ) {
      throw new DomainError(
        "L'objectif doit être un entier strictement positif",
      );
    }
    if (
      !Number.isInteger(props.startCents) ||
      props.startCents < 0 ||
      props.startCents > MAX_PROJECT_CENTS
    ) {
      throw new DomainError(
        'Le montant déjà épargné doit être un entier positif ou nul',
      );
    }
    if (!isIsoDate(props.startDate)) {
      throw new DomainError(
        'Date de début invalide, format attendu : AAAA-MM-JJ',
      );
    }
    if (!isIsoDate(props.targetDate)) {
      throw new DomainError(
        "Date d'échéance invalide, format attendu : AAAA-MM-JJ",
      );
    }
    if (props.targetDate <= props.startDate) {
      throw new DomainError(
        "L'échéance doit être postérieure à la date de début",
      );
    }
  }

  static create(props: ProjectProps): Project {
    return new Project({ ...props, name: props.name.trim() });
  }

  get id(): string {
    return this.props.id;
  }
  get spaceId(): string {
    return this.props.spaceId;
  }
  get name(): string {
    return this.props.name;
  }
  get kind(): ProjectKind {
    return this.props.kind;
  }
  get targetCents(): number {
    return this.props.targetCents;
  }
  get targetDate(): string {
    return this.props.targetDate;
  }
  get startCents(): number {
    return this.props.startCents;
  }
  get startDate(): string {
    return this.props.startDate;
  }
  get archived(): boolean {
    return this.props.archived;
  }
  get accountId(): string | null {
    return this.props.accountId;
  }
}
