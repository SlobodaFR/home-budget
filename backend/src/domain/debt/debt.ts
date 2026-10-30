import { isIsoDate } from '../shared/calendar';
import { DomainError } from '../shared/domain-error';

export const DEBT_KINDS = [
  'MORTGAGE',
  'CAR',
  'CONSUMER',
  'STUDENT',
  'OTHER',
] as const;
export type DebtKind = (typeof DEBT_KINDS)[number];

export const MAX_DEBT_NAME_LENGTH = 60;
/** Garde-fou : 10 milliards d'euros en centimes. */
export const MAX_DEBT_CENTS = 1_000_000_000_000;
/** Taux annuel maximal accepté, en centièmes de pourcent (100 %). */
export const MAX_RATE_HUNDREDTHS = 10_000;

/**
 * Convertit un taux annuel saisi en pourcent (3,9) en centièmes de pourcent
 * entiers (390), sans dérive flottante : on arrondit x × 100 puis on exige que
 * l'écart soit négligeable (au plus 2 décimales), sinon DomainError.
 */
export function ratePercentToHundredths(percent: number): number {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) {
    throw new DomainError('Le taux annuel doit être un nombre');
  }
  const scaled = percent * 100;
  const hundredths = Math.round(scaled);
  if (Math.abs(scaled - hundredths) > 1e-6) {
    throw new DomainError('Le taux annuel accepte 2 décimales au plus');
  }
  if (hundredths < 0 || hundredths > MAX_RATE_HUNDREDTHS) {
    throw new DomainError('Le taux annuel doit être compris entre 0 et 100 %');
  }
  return hundredths;
}

export interface DebtProps {
  id: string;
  spaceId: string;
  name: string;
  kind: DebtKind;
  /** Capital emprunté, entier > 0. */
  principalCents: number;
  /** Capital restant dû déclaré (relevé de la banque), 0 <= restant <= emprunté. */
  remainingCents: number;
  /** Taux annuel (TAEG hors assurance) en centièmes de pourcent entiers : 390 = 3,90 %. */
  annualRateHundredths: number;
  /** Mensualité hors assurance. */
  monthlyPaymentCents: number;
  /** AAAA-MM-JJ. */
  startDate: string;
  /** Jour de prélèvement, 1 à 28. */
  paymentDay: number;
  /** Assurance emprunteur mensuelle. */
  insuranceMonthlyCents: number;
  archived: boolean;
  /** Paiement récurrent de l'espace qui représente la mensualité. */
  recurringId: string | null;
}

/** Crédit (immobilier, auto, conso…) rattaché à un espace. */
export class Debt {
  private constructor(private readonly props: DebtProps) {
    const name = props.name.trim();
    if (!name) {
      throw new DomainError('Le nom du crédit ne doit pas être vide');
    }
    if (name.length > MAX_DEBT_NAME_LENGTH) {
      throw new DomainError(
        `Nom du crédit trop long (${MAX_DEBT_NAME_LENGTH} caractères)`,
      );
    }
    if (!(DEBT_KINDS as readonly string[]).includes(props.kind)) {
      throw new DomainError(
        `Type de crédit invalide : ${DEBT_KINDS.join(', ')}`,
      );
    }
    const isCents = (v: number, min: number) =>
      Number.isInteger(v) && v >= min && v <= MAX_DEBT_CENTS;
    if (!isCents(props.principalCents, 1)) {
      throw new DomainError(
        'Le capital emprunté doit être un entier strictement positif',
      );
    }
    if (!isCents(props.remainingCents, 0)) {
      throw new DomainError(
        'Le capital restant dû doit être un entier positif ou nul',
      );
    }
    if (props.remainingCents > props.principalCents) {
      throw new DomainError(
        'Le capital restant dû ne peut pas dépasser le capital emprunté',
      );
    }
    if (
      !Number.isInteger(props.annualRateHundredths) ||
      props.annualRateHundredths < 0 ||
      props.annualRateHundredths > MAX_RATE_HUNDREDTHS
    ) {
      throw new DomainError(
        'Le taux annuel doit être compris entre 0 et 100 %',
      );
    }
    if (!isCents(props.monthlyPaymentCents, 0)) {
      throw new DomainError('La mensualité doit être un entier positif ou nul');
    }
    if (!isCents(props.insuranceMonthlyCents, 0)) {
      throw new DomainError(
        "L'assurance mensuelle doit être un entier positif ou nul",
      );
    }
    if (!isIsoDate(props.startDate)) {
      throw new DomainError(
        'Date de début invalide, format attendu : AAAA-MM-JJ',
      );
    }
    if (
      !Number.isInteger(props.paymentDay) ||
      props.paymentDay < 1 ||
      props.paymentDay > 28
    ) {
      throw new DomainError(
        'Le jour de prélèvement doit être compris entre 1 et 28',
      );
    }
  }

  static create(props: DebtProps): Debt {
    return new Debt({ ...props, name: props.name.trim() });
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
  get kind(): DebtKind {
    return this.props.kind;
  }
  get principalCents(): number {
    return this.props.principalCents;
  }
  get remainingCents(): number {
    return this.props.remainingCents;
  }
  get annualRateHundredths(): number {
    return this.props.annualRateHundredths;
  }
  get monthlyPaymentCents(): number {
    return this.props.monthlyPaymentCents;
  }
  get startDate(): string {
    return this.props.startDate;
  }
  get paymentDay(): number {
    return this.props.paymentDay;
  }
  get insuranceMonthlyCents(): number {
    return this.props.insuranceMonthlyCents;
  }
  get archived(): boolean {
    return this.props.archived;
  }
  get recurringId(): string | null {
    return this.props.recurringId;
  }
}
