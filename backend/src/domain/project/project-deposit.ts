import { isIsoDate } from '../shared/calendar';
import { DomainError } from '../shared/domain-error';

export const MAX_NOTE_LENGTH = 120;
const MAX_DEPOSIT_CENTS = 1_000_000_000_000;

export interface ProjectDepositProps {
  id: string;
  projectId: string;
  spaceId: string;
  /** AAAA-MM-JJ. */
  date: string;
  /** Entier non nul : négatif = retrait. */
  amountCents: number;
  note: string;
}

/** Versement (ou retrait, s'il est négatif) sur un projet d'épargne. */
export class ProjectDeposit {
  private constructor(private readonly props: ProjectDepositProps) {
    if (!isIsoDate(props.date)) {
      throw new DomainError('Date invalide, format attendu : AAAA-MM-JJ');
    }
    if (
      !Number.isInteger(props.amountCents) ||
      props.amountCents === 0 ||
      Math.abs(props.amountCents) > MAX_DEPOSIT_CENTS
    ) {
      throw new DomainError(
        'Le montant doit être un entier non nul (négatif pour un retrait)',
      );
    }
    if (props.note.length > MAX_NOTE_LENGTH) {
      throw new DomainError(`Note trop longue (${MAX_NOTE_LENGTH} caractères)`);
    }
  }

  static create(props: ProjectDepositProps): ProjectDeposit {
    return new ProjectDeposit({ ...props, note: props.note.trim() });
  }

  get id(): string {
    return this.props.id;
  }
  get projectId(): string {
    return this.props.projectId;
  }
  get spaceId(): string {
    return this.props.spaceId;
  }
  get date(): string {
    return this.props.date;
  }
  get amountCents(): number {
    return this.props.amountCents;
  }
  get note(): string {
    return this.props.note;
  }
}
