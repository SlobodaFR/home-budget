import { AidRuleId, isAidRuleId } from '../aid/aid-rules';
import { isIsoDate } from '../shared/calendar';
import { Bloc, isBloc } from '../shared/bloc';
import { DomainError } from '../shared/domain-error';
import { Money } from '../shared/money';
import { Space } from '../space/space';
import { TransactionKind } from '../transaction/transaction';

export interface RecurringItemProps {
  id: string;
  spaceId: string;
  kind: TransactionKind;
  /** Obligatoire pour une dépense, absent pour un revenu. */
  bloc: Bloc | null;
  label: string;
  /** Toujours positif : le sens vient de `kind`. */
  amount: Money;
  /** 1 à 31, ou null si le jour est inconnu (occurrence estimée en fin de mois). */
  dayOfMonth: number | null;
  /** AAAA-MM-JJ. */
  startDate: string;
  /** AAAA-MM-JJ, null = sans fin. */
  endDate: string | null;
  active: boolean;
  aidRuleId: AidRuleId | null;
}

export const MAX_RECURRING_LABEL_LENGTH = 80;

/** Gabarit d'un paiement ou d'un revenu mensuel (loyer, salaire, abonnement). */
export class RecurringItem {
  private constructor(private readonly props: RecurringItemProps) {
    if (!props.label.trim()) {
      throw new DomainError('Le libellé ne doit pas être vide');
    }
    if (props.label.trim().length > MAX_RECURRING_LABEL_LENGTH) {
      throw new DomainError(
        `Libellé trop long (${MAX_RECURRING_LABEL_LENGTH} caractères)`,
      );
    }
    if (props.amount.toCents() <= 0) {
      throw new DomainError('Le montant doit être strictement positif');
    }
    if (props.kind !== 'INCOME' && props.kind !== 'EXPENSE') {
      throw new DomainError('Type invalide : INCOME ou EXPENSE');
    }
    if (props.kind === 'EXPENSE' && !isBloc(props.bloc)) {
      throw new DomainError('Une dépense doit être rangée dans un bloc');
    }
    if (props.kind === 'INCOME' && props.bloc !== null) {
      throw new DomainError("Un revenu n'a pas de bloc");
    }
    if (
      props.dayOfMonth !== null &&
      (!Number.isInteger(props.dayOfMonth) ||
        props.dayOfMonth < 1 ||
        props.dayOfMonth > 31)
    ) {
      throw new DomainError('Le jour du mois doit être compris entre 1 et 31');
    }
    if (!isIsoDate(props.startDate)) {
      throw new DomainError(
        'Date de début invalide, format attendu : AAAA-MM-JJ',
      );
    }
    if (props.endDate !== null) {
      if (!isIsoDate(props.endDate)) {
        throw new DomainError(
          'Date de fin invalide, format attendu : AAAA-MM-JJ',
        );
      }
      if (props.endDate < props.startDate) {
        throw new DomainError(
          'La date de fin ne peut pas précéder la date de début',
        );
      }
    }
    if (props.aidRuleId !== null) {
      if (!isAidRuleId(props.aidRuleId)) {
        throw new DomainError("Règle d'aide inconnue");
      }
      if (props.kind === 'INCOME') {
        throw new DomainError('Un revenu ne peut pas être rattaché à une aide');
      }
    }
  }

  static create(props: RecurringItemProps): RecurringItem {
    return new RecurringItem({ ...props, label: props.label.trim() });
  }

  /**
   * Création dans un espace donné : les aides reposent sur les plafonds du foyer
   * fiscal, elles n'existent donc que dans l'espace commun.
   */
  static createIn(space: Space, props: RecurringItemProps): RecurringItem {
    if (props.aidRuleId !== null && space.isPersonal()) {
      throw new DomainError(
        "Les aides ne s'appliquent qu'à l'espace commun (plafonds du foyer fiscal)",
      );
    }
    return RecurringItem.create(props);
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

  get dayOfMonth(): number | null {
    return this.props.dayOfMonth;
  }

  get startDate(): string {
    return this.props.startDate;
  }

  get endDate(): string | null {
    return this.props.endDate;
  }

  get active(): boolean {
    return this.props.active;
  }

  get aidRuleId(): AidRuleId | null {
    return this.props.aidRuleId;
  }
}
