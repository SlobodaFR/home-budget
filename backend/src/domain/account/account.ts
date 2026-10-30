import { isIsoDate } from '../shared/calendar';
import { DomainError } from '../shared/domain-error';

export const ACCOUNT_KINDS = ['CHECKING', 'SAVINGS', 'CASH'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const MAX_ACCOUNT_NAME_LENGTH = 60;
/** Garde-fou : 10 milliards d'euros en centimes. */
export const MAX_OPENING_BALANCE_CENTS = 1_000_000_000_000;

export interface AccountProps {
  id: string;
  spaceId: string;
  name: string;
  kind: AccountKind;
  /** Signé : un découvert est possible. */
  openingBalanceCents: number;
  /** AAAA-MM-JJ : les opérations antérieures ne comptent pas dans le solde. */
  openingDate: string;
  archived: boolean;
}

/**
 * Compte bancaire : dit où l'argent circule (l'espace dit qui décide du budget).
 * Un compte archivé garde son historique mais n'accepte plus d'opération.
 */
export class Account {
  private constructor(private readonly props: AccountProps) {
    const name = props.name.trim();
    if (!name) {
      throw new DomainError('Le nom du compte ne doit pas être vide');
    }
    if (name.length > MAX_ACCOUNT_NAME_LENGTH) {
      throw new DomainError(
        `Nom du compte trop long (${MAX_ACCOUNT_NAME_LENGTH} caractères)`,
      );
    }
    if (!(ACCOUNT_KINDS as readonly string[]).includes(props.kind)) {
      throw new DomainError(
        'Type de compte invalide : CHECKING, SAVINGS ou CASH',
      );
    }
    if (
      !Number.isInteger(props.openingBalanceCents) ||
      Math.abs(props.openingBalanceCents) > MAX_OPENING_BALANCE_CENTS
    ) {
      throw new DomainError(
        "Le solde d'ouverture doit être un entier de centimes",
      );
    }
    if (!isIsoDate(props.openingDate)) {
      throw new DomainError(
        "Date d'ouverture invalide, format attendu : AAAA-MM-JJ",
      );
    }
  }

  static create(props: AccountProps): Account {
    return new Account({ ...props, name: props.name.trim() });
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

  get kind(): AccountKind {
    return this.props.kind;
  }

  get openingBalanceCents(): number {
    return this.props.openingBalanceCents;
  }

  get openingDate(): string {
    return this.props.openingDate;
  }

  get archived(): boolean {
    return this.props.archived;
  }

  /** Deux noms sont identiques à la casse près. */
  hasSameNameAs(name: string): boolean {
    return (
      this.props.name.toLocaleLowerCase('fr') ===
      name.trim().toLocaleLowerCase('fr')
    );
  }
}

/**
 * Un compte ne reçoit une opération (ou un paiement récurrent) que s'il appartient
 * au même espace et n'est pas archivé. `keepsCurrent` : le rattachement existant
 * est conservé tel quel (modifier une vieille opération d'un compte archivé reste possible).
 */
export function assertAccountUsable(
  account: Account | null,
  spaceId: string,
  keepsCurrent = false,
): void {
  if (!account || account.spaceId !== spaceId) {
    throw new DomainError("Ce compte n'existe pas dans cet espace");
  }
  if (account.archived && !keepsCurrent) {
    throw new DomainError(
      "Ce compte est archivé : il n'accepte plus de nouvelle opération",
    );
  }
}
