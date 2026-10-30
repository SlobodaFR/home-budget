import { Bloc, isBloc } from '../shared/bloc';
import { DomainError } from '../shared/domain-error';
import { Money } from '../shared/money';

export type TransactionKind = 'INCOME' | 'EXPENSE';

export interface TransactionProps {
  id: string;
  spaceId: string;
  kind: TransactionKind;
  /** Obligatoire pour une depense, absent pour un revenu. */
  bloc: Bloc | null;
  label: string;
  /** Toujours positif : le sens vient de `kind`. */
  amount: Money;
  date: Date;
  /** Compte bancaire de l'espace ; absent ou null = non rattachée. */
  accountId?: string | null;
  /**
   * Membre qui a versé sa contribution au foyer : uniquement un revenu de l'espace
   * commun, posé par le suivi des contributions. Va de pair avec `contributionMonth`.
   */
  contributionUserId?: string | null;
  /** Mois (AAAA-MM) que couvre la contribution versée. */
  contributionMonth?: string | null;
}

const CONTRIBUTION_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const MAX_LABEL_LENGTH = 80;

export class Transaction {
  private constructor(private readonly props: TransactionProps) {
    if (!props.label.trim()) {
      throw new DomainError('Le libelle ne doit pas etre vide');
    }
    if (props.label.trim().length > MAX_LABEL_LENGTH) {
      throw new DomainError(
        `Libelle trop long (${MAX_LABEL_LENGTH} caracteres)`,
      );
    }
    if (props.amount.toCents() <= 0) {
      throw new DomainError('Le montant doit etre strictement positif');
    }
    if (props.kind === 'EXPENSE' && !isBloc(props.bloc)) {
      throw new DomainError('Une depense doit etre rangee dans un bloc');
    }
    if (props.kind === 'INCOME' && props.bloc !== null) {
      throw new DomainError("Un revenu n'a pas de bloc");
    }
    if (Number.isNaN(props.date.getTime())) {
      throw new DomainError('Date invalide');
    }
    const hasUser = (props.contributionUserId ?? null) !== null;
    const hasMonth = (props.contributionMonth ?? null) !== null;
    if (hasUser !== hasMonth) {
      throw new DomainError(
        'Une contribution porte à la fois un membre et un mois',
      );
    }
    if (hasUser && props.kind !== 'INCOME') {
      throw new DomainError('Seul un revenu peut être une contribution');
    }
    if (
      hasMonth &&
      !CONTRIBUTION_MONTH_PATTERN.test(props.contributionMonth as string)
    ) {
      throw new DomainError('Mois de contribution invalide : AAAA-MM');
    }
  }

  static create(props: TransactionProps): Transaction {
    return new Transaction({ ...props, label: props.label.trim() });
  }

  get id(): string {
    return this.props.id;
  }

  get spaceId(): string {
    return this.props.spaceId;
  }

  get kind(): TransactionKind {
    return this.props.kind;
  }

  get bloc(): Bloc | null {
    return this.props.bloc;
  }

  get label(): string {
    return this.props.label;
  }

  get amount(): Money {
    return this.props.amount;
  }

  get date(): Date {
    return this.props.date;
  }

  get accountId(): string | null {
    return this.props.accountId ?? null;
  }

  get contributionUserId(): string | null {
    return this.props.contributionUserId ?? null;
  }

  get contributionMonth(): string | null {
    return this.props.contributionMonth ?? null;
  }
}
