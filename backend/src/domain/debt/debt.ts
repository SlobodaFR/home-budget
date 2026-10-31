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

export const DEBT_RATE_TYPES = ['FIXED', 'VARIABLE', 'ADJUSTABLE'] as const;
/** Type de taux du contrat ; seul `FIXED` (ou inconnu) permet de vérifier la mensualité. */
export type DebtRateType = (typeof DEBT_RATE_TYPES)[number];

export const INSURANCE_MODES = [
  'FIXED',
  'PERCENT_INITIAL',
  'PERCENT_REMAINING',
] as const;
/**
 * Calcul de l'assurance emprunteur : montant mensuel saisi, ou pourcentage annuel
 * du capital emprunté / du capital restant dû.
 */
export type InsuranceMode = (typeof INSURANCE_MODES)[number];

export const GUARANTEE_KINDS = ['NONE', 'SURETY', 'MORTGAGE', 'OTHER'] as const;
export type GuaranteeKind = (typeof GUARANTEE_KINDS)[number];

export const MAX_DEBT_NAME_LENGTH = 60;
export const MAX_DEBT_LENDER_LENGTH = 80;
export const MAX_DEBT_REFERENCE_LENGTH = 60;
export const MAX_DEBT_NOTES_LENGTH = 500;
export const MIN_INITIAL_TERM_MONTHS = 1;
export const MAX_INITIAL_TERM_MONTHS = 600;
export const MIN_INSURANCE_QUOTITY_PERCENT = 1;
export const MAX_INSURANCE_QUOTITY_PERCENT = 200;
/** Taux d'assurance annuel maximal, en centièmes de pourcent (20 %). */
export const MAX_INSURANCE_RATE_HUNDREDTHS = 2_000;
/** Garde-fou : 10 milliards d'euros en centimes. */
export const MAX_DEBT_CENTS = 1_000_000_000_000;
/** Taux annuel maximal accepté, en centièmes de pourcent (100 %). */
export const MAX_RATE_HUNDREDTHS = 10_000;

interface PercentMessages {
  notANumber: string;
  tooPrecise: string;
  outOfRange: string;
}

/**
 * Convertit un pourcentage saisi en centièmes de pourcent entiers, sans dérive
 * flottante : on arrondit x × 100 puis on exige que l'écart soit négligeable
 * (au plus 2 décimales), sinon DomainError.
 */
function percentToHundredths(
  percent: number,
  maxHundredths: number,
  messages: PercentMessages,
): number {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) {
    throw new DomainError(messages.notANumber);
  }
  const scaled = percent * 100;
  const hundredths = Math.round(scaled);
  if (Math.abs(scaled - hundredths) > 1e-6) {
    throw new DomainError(messages.tooPrecise);
  }
  if (hundredths < 0 || hundredths > maxHundredths) {
    throw new DomainError(messages.outOfRange);
  }
  return hundredths;
}

/**
 * Convertit un taux annuel saisi en pourcent (3,9) en centièmes de pourcent
 * entiers (390), sans dérive flottante.
 */
export function ratePercentToHundredths(percent: number): number {
  return percentToHundredths(percent, MAX_RATE_HUNDREDTHS, {
    notANumber: 'Le taux annuel doit être un nombre',
    tooPrecise: 'Le taux annuel accepte 2 décimales au plus',
    outOfRange: 'Le taux annuel doit être compris entre 0 et 100 %',
  });
}

/** Même conversion pour le taux annuel d'assurance (0 à 20 %, 2 décimales au plus). */
export function insuranceRatePercentToHundredths(percent: number): number {
  return percentToHundredths(percent, MAX_INSURANCE_RATE_HUNDREDTHS, {
    notANumber: "Le taux d'assurance doit être un nombre",
    tooPrecise: "Le taux d'assurance accepte 2 décimales au plus",
    outOfRange: "Le taux d'assurance doit être compris entre 0 et 20 %",
  });
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
  /** Prêteur (banque) ; '' si non renseigné. */
  lender: string;
  /** Référence du contrat ; '' si non renseignée. */
  contractReference: string;
  /** Durée du prêt à l'origine, en mois (1-600) ; null si inconnue. */
  initialTermMonths: number | null;
  /** Taux fixe, variable ou révisable ; null si inconnu. */
  rateType: DebtRateType | null;
  insuranceMode: InsuranceMode;
  /** Taux annuel d'assurance en centièmes de pourcent (0-2000) ; obligatoire en mode pourcentage, null sinon. */
  insuranceRateHundredths: number | null;
  /** Part assurée en pourcent, entier 1-200 (100 par défaut) ; ignorée en mode FIXED. */
  insuranceQuotityPercent: number;
  /** Frais de dossier. */
  feesCents: number;
  guaranteeKind: GuaranteeKind;
  /** Frais de garantie ; > 0 exige un type de garantie autre que NONE. */
  guaranteeCents: number;
  notes: string;
}

/** Valeurs des champs de la tranche 12 pour un crédit qui n'en avait pas (contrat de l'API). */
export const DEBT_EXTENSION_DEFAULTS = {
  lender: '',
  contractReference: '',
  initialTermMonths: null,
  rateType: null,
  insuranceMode: 'FIXED',
  insuranceRateHundredths: null,
  insuranceQuotityPercent: 100,
  feesCents: 0,
  guaranteeKind: 'NONE',
  guaranteeCents: 0,
  notes: '',
} as const satisfies Pick<
  DebtProps,
  | 'lender'
  | 'contractReference'
  | 'initialTermMonths'
  | 'rateType'
  | 'insuranceMode'
  | 'insuranceRateHundredths'
  | 'insuranceQuotityPercent'
  | 'feesCents'
  | 'guaranteeKind'
  | 'guaranteeCents'
  | 'notes'
>;

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
    this.validateExtension(props, isCents);
  }

  private validateExtension(
    props: DebtProps,
    isCents: (v: number, min: number) => boolean,
  ): void {
    if (props.lender.length > MAX_DEBT_LENDER_LENGTH) {
      throw new DomainError(
        `Nom du prêteur trop long (${MAX_DEBT_LENDER_LENGTH} caractères)`,
      );
    }
    if (props.contractReference.length > MAX_DEBT_REFERENCE_LENGTH) {
      throw new DomainError(
        `Référence du contrat trop longue (${MAX_DEBT_REFERENCE_LENGTH} caractères)`,
      );
    }
    if (props.notes.length > MAX_DEBT_NOTES_LENGTH) {
      throw new DomainError(
        `Notes trop longues (${MAX_DEBT_NOTES_LENGTH} caractères)`,
      );
    }
    if (
      props.initialTermMonths !== null &&
      (!Number.isInteger(props.initialTermMonths) ||
        props.initialTermMonths < MIN_INITIAL_TERM_MONTHS ||
        props.initialTermMonths > MAX_INITIAL_TERM_MONTHS)
    ) {
      throw new DomainError(
        `La durée initiale doit être un nombre entier de mois compris entre ${MIN_INITIAL_TERM_MONTHS} et ${MAX_INITIAL_TERM_MONTHS}`,
      );
    }
    if (
      props.rateType !== null &&
      !(DEBT_RATE_TYPES as readonly string[]).includes(props.rateType)
    ) {
      throw new DomainError(
        `Type de taux invalide : ${DEBT_RATE_TYPES.join(', ')}`,
      );
    }
    if (!(INSURANCE_MODES as readonly string[]).includes(props.insuranceMode)) {
      throw new DomainError(
        `Mode de calcul de l'assurance invalide : ${INSURANCE_MODES.join(', ')}`,
      );
    }
    if (props.insuranceMode === 'FIXED') {
      if (props.insuranceRateHundredths !== null) {
        throw new DomainError(
          "Le taux d'assurance ne s'applique qu'aux modes en pourcentage",
        );
      }
    } else if (props.insuranceRateHundredths === null) {
      throw new DomainError(
        "Indiquez le taux d'assurance (en %) pour ce mode de calcul de l'assurance",
      );
    }
    if (
      props.insuranceRateHundredths !== null &&
      (!Number.isInteger(props.insuranceRateHundredths) ||
        props.insuranceRateHundredths < 0 ||
        props.insuranceRateHundredths > MAX_INSURANCE_RATE_HUNDREDTHS)
    ) {
      throw new DomainError(
        "Le taux d'assurance doit être compris entre 0 et 20 %",
      );
    }
    if (
      !Number.isInteger(props.insuranceQuotityPercent) ||
      props.insuranceQuotityPercent < MIN_INSURANCE_QUOTITY_PERCENT ||
      props.insuranceQuotityPercent > MAX_INSURANCE_QUOTITY_PERCENT
    ) {
      throw new DomainError(
        `La quotité d'assurance doit être un entier compris entre ${MIN_INSURANCE_QUOTITY_PERCENT} et ${MAX_INSURANCE_QUOTITY_PERCENT} %`,
      );
    }
    if (!isCents(props.feesCents, 0)) {
      throw new DomainError(
        'Les frais de dossier doivent être un entier positif ou nul',
      );
    }
    if (!(GUARANTEE_KINDS as readonly string[]).includes(props.guaranteeKind)) {
      throw new DomainError(
        `Type de garantie invalide : ${GUARANTEE_KINDS.join(', ')}`,
      );
    }
    if (!isCents(props.guaranteeCents, 0)) {
      throw new DomainError(
        'Les frais de garantie doivent être un entier positif ou nul',
      );
    }
    if (props.guaranteeCents > 0 && props.guaranteeKind === 'NONE') {
      throw new DomainError(
        'Précisez le type de garantie (caution, hypothèque ou autre) pour des frais de garantie supérieurs à 0',
      );
    }
  }

  static create(props: DebtProps): Debt {
    return new Debt({
      ...props,
      name: props.name.trim(),
      lender: props.lender.trim(),
      contractReference: props.contractReference.trim(),
      notes: props.notes.trim(),
    });
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
  get lender(): string {
    return this.props.lender;
  }
  get contractReference(): string {
    return this.props.contractReference;
  }
  get initialTermMonths(): number | null {
    return this.props.initialTermMonths;
  }
  get rateType(): DebtRateType | null {
    return this.props.rateType;
  }
  get insuranceMode(): InsuranceMode {
    return this.props.insuranceMode;
  }
  get insuranceRateHundredths(): number | null {
    return this.props.insuranceRateHundredths;
  }
  get insuranceQuotityPercent(): number {
    return this.props.insuranceQuotityPercent;
  }
  get feesCents(): number {
    return this.props.feesCents;
  }
  get guaranteeKind(): GuaranteeKind {
    return this.props.guaranteeKind;
  }
  get guaranteeCents(): number {
    return this.props.guaranteeCents;
  }
  get notes(): string {
    return this.props.notes;
  }
}
