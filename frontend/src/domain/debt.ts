import { centsToInputValue, formatCentsShort, parseAmountToCents } from './money';
import { formatLongDateInput, isValidDateInput, todayInputValue } from './month';
import { RecurringPayment } from './recurring';

export const MAX_DEBT_NAME_LENGTH = 60;
export const MIN_PAYMENT_DAY = 1;
export const MAX_PAYMENT_DAY = 28;
export const MAX_RATE_PERCENT = 100;
export const MAX_LENDER_LENGTH = 80;
export const MAX_CONTRACT_REFERENCE_LENGTH = 60;
export const MAX_NOTES_LENGTH = 500;
export const MIN_TERM_MONTHS = 1;
export const MAX_TERM_MONTHS = 600;
export const MAX_INSURANCE_RATE_PERCENT = 20;
export const MIN_QUOTITY_PERCENT = 1;
export const MAX_QUOTITY_PERCENT = 200;
export const DEFAULT_QUOTITY_PERCENT = 100;

/** Repère courant du taux d'endettement (mensualités ÷ revenus). Un repère du cours, pas une règle de droit. */
export const DEBT_RATIO_REFERENCE_PERCENT = 35;

export type DebtKind = 'MORTGAGE' | 'CAR' | 'CONSUMER' | 'STUDENT' | 'OTHER';

export const DEBT_KINDS: readonly DebtKind[] = ['MORTGAGE', 'CAR', 'CONSUMER', 'STUDENT', 'OTHER'];

export const DEBT_KIND_LABEL: Record<DebtKind, string> = {
  MORTGAGE: 'Immobilier',
  CAR: 'Auto',
  CONSUMER: 'Consommation',
  STUDENT: 'Études',
  OTHER: 'Autre',
};

export type RateType = 'FIXED' | 'VARIABLE' | 'ADJUSTABLE';
export const RATE_TYPES: readonly RateType[] = ['FIXED', 'VARIABLE', 'ADJUSTABLE'];
export const RATE_TYPE_LABEL: Record<RateType, string> = { FIXED: 'Fixe', VARIABLE: 'Variable', ADJUSTABLE: 'Révisable' };
export const RATE_TYPE_UNKNOWN_LABEL = 'Non précisé';

export type InsuranceMode = 'FIXED' | 'PERCENT_INITIAL' | 'PERCENT_REMAINING';
export const INSURANCE_MODES: readonly InsuranceMode[] = ['FIXED', 'PERCENT_INITIAL', 'PERCENT_REMAINING'];
export const INSURANCE_MODE_LABEL: Record<InsuranceMode, string> = {
  FIXED: 'Montant mensuel fixe',
  PERCENT_INITIAL: '% du capital emprunté',
  PERCENT_REMAINING: '% du capital restant dû',
};

export type GuaranteeKind = 'NONE' | 'SURETY' | 'MORTGAGE' | 'OTHER';
export const GUARANTEE_KINDS: readonly GuaranteeKind[] = ['NONE', 'SURETY', 'MORTGAGE', 'OTHER'];
export const GUARANTEE_KIND_LABEL: Record<GuaranteeKind, string> = { NONE: 'Aucune', SURETY: 'Caution', MORTGAGE: 'Hypothèque', OTHER: 'Autre' };

export type PaymentCheckStatus = 'OK' | 'GAP' | 'UNKNOWN';

/** Cohérence entre la mensualité saisie et le prêt d'origine. Le serveur ne corrige jamais la saisie : il signale seulement l'écart. */
export interface PaymentCheck {
  status: PaymentCheckStatus;
  expectedMonthlyPaymentCents: number | null;
  /** Saisie moins attendu (signé). */
  differenceCents: number | null;
  /** Entier signé. */
  differencePercent: number | null;
}

export const UNKNOWN_PAYMENT_CHECK: PaymentCheck = { status: 'UNKNOWN', expectedMonthlyPaymentCents: null, differenceCents: null, differencePercent: null };

export interface Debt {
  id: string;
  spaceId: string;
  name: string;
  kind: DebtKind;
  /** Capital emprunté. */
  principalCents: number;
  /** Capital restant dû, déclaré (tableau d'amortissement ou relevé de la banque). */
  remainingCents: number;
  /** Jusqu'à 2 décimales. */
  annualRatePercent: number;
  /** Hors assurance. */
  monthlyPaymentCents: number;
  /** `AAAA-MM-JJ`. */
  startDate: string;
  paymentDay: number;
  /** Assurance saisie en montant mensuel (mode `FIXED`). */
  insuranceMonthlyCents: number;
  /** Prêteur (chaîne vide si non précisé). */
  lender: string;
  contractReference: string;
  /** Durée du prêt à l'origine, en mois (1-600). */
  initialTermMonths: number | null;
  /** `null` : non précisé. Les calculs supposent un taux fixe. */
  rateType: RateType | null;
  insuranceMode: InsuranceMode;
  /** Taux annuel de l'assurance en pourcentage (modes en pourcentage uniquement). */
  insuranceRatePercent: number | null;
  insuranceQuotityPercent: number;
  /** Frais de dossier. */
  feesCents: number;
  guaranteeKind: GuaranteeKind;
  guaranteeCents: number;
  notes: string;
  /** Assurance du mois courant, calculée. */
  monthlyInsuranceCents: number;
  /** Mensualité plus assurance, calculée. */
  monthlyTotalCents: number;
  /** Assurance des mensualités restantes ; `null` si inconnue ou si la dette ne diminue pas. */
  remainingInsuranceCents: number | null;
  /** Intérêts restants plus assurance restante ; `null` si inconnu ou si la dette ne diminue pas. */
  remainingCostCents: number | null;
  paymentCheck: PaymentCheck;
  /** `null` quand la mensualité ne couvre pas les intérêts. */
  monthsRemaining: number | null;
  payoffDate: string | null;
  totalInterestRemainingCents: number | null;
  paidSharePercent: number;
  neverPaidOff: boolean;
  archived: boolean;
  recurringId: string | null;
}

export interface DebtPayload {
  name: string;
  kind: DebtKind;
  principalCents: number;
  remainingCents: number;
  annualRatePercent: number;
  monthlyPaymentCents: number;
  startDate: string;
  paymentDay: number;
  insuranceMonthlyCents: number;
  recurringId: string | null;
  lender: string;
  contractReference: string;
  initialTermMonths: number | null;
  rateType: RateType | null;
  insuranceMode: InsuranceMode;
  insuranceRatePercent: number | null;
  insuranceQuotityPercent: number;
  feesCents: number;
  guaranteeKind: GuaranteeKind;
  guaranteeCents: number;
  notes: string;
  archived?: boolean;
}

export interface LenderSummary {
  /** Chaîne vide : prêteur non précisé. */
  lender: string;
  activeCount: number;
  remainingCents: number;
  monthlyTotalCents: number;
}

export interface DebtsSummary {
  activeCount: number;
  totalRemainingCents: number;
  totalMonthlyCents: number;
  /** `null` : revenus inconnus. */
  debtToIncomePercent: number | null;
  /** Assurances mensuelles des crédits en cours (déjà comprises dans `totalMonthlyCents`). */
  totalMonthlyInsuranceCents: number;
  /** Intérêts et assurances restant à payer ; `null` si le serveur ne l'envoie pas. */
  totalRemainingCostCents: number | null;
  byLender: LenderSummary[];
}

export interface WhatIfScenario {
  monthsRemaining: number | null;
  totalInterestRemainingCents: number | null;
  payoffDate: string | null;
}

export interface WhatIfResult {
  baseline: WhatIfScenario;
  scenario: WhatIfScenario;
  /** Jamais négatif. */
  interestSavedCents: number;
  /** Jamais négatif. */
  monthsSaved: number;
  /** Économie d'assurance du scénario, jamais négative ; `null` si inconnue. */
  insuranceSavedCents: number | null;
  note: string;
}

export interface WhatIfQuery {
  extraMonthlyCents: number;
  lumpSumCents: number;
}

/** Rappel affiché quand le serveur n'envoie pas sa propre note : la mention sur les indemnités est obligatoire. */
export const DEFAULT_WHAT_IF_NOTE = 'Vérifiez les indemnités de remboursement anticipé de votre contrat.';

// ---------------------------------------------------------------------------------------------------------------------
// Lecture tolérante des réponses du serveur
// ---------------------------------------------------------------------------------------------------------------------

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const asObject = (value: unknown): Record<string, unknown> => (value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {});
const asCents = (value: unknown): number => (isNumber(value) ? Math.max(0, Math.round(value)) : 0);
const asMonths = (value: unknown): number | null => (isNumber(value) ? Math.max(0, Math.trunc(value)) : null);
const asNullableCents = (value: unknown): number | null => (isNumber(value) ? Math.max(0, Math.round(value)) : null);
const asDate = (value: unknown): string | null => (typeof value === 'string' && isValidDateInput(value.slice(0, 10)) ? value.slice(0, 10) : null);

function kindOf(value: unknown): DebtKind {
  return DEBT_KINDS.includes(value as DebtKind) ? (value as DebtKind) : 'OTHER';
}

const asText = (value: unknown): string => (typeof value === 'string' ? value : '');
const rateTypeOf = (value: unknown): RateType | null => (RATE_TYPES.includes(value as RateType) ? (value as RateType) : null);
const insuranceModeOf = (value: unknown): InsuranceMode => (INSURANCE_MODES.includes(value as InsuranceMode) ? (value as InsuranceMode) : 'FIXED');
const guaranteeKindOf = (value: unknown): GuaranteeKind => (GUARANTEE_KINDS.includes(value as GuaranteeKind) ? (value as GuaranteeKind) : 'NONE');
const asTermMonths = (value: unknown): number | null =>
  isNumber(value) && Number.isInteger(value) && value >= MIN_TERM_MONTHS && value <= MAX_TERM_MONTHS ? value : null;
const asQuotity = (value: unknown): number =>
  isNumber(value) ? Math.min(MAX_QUOTITY_PERCENT, Math.max(MIN_QUOTITY_PERCENT, Math.round(value))) : DEFAULT_QUOTITY_PERCENT;

/** L'assurance d'un mois quand le serveur ne l'a pas calculée : montant saisi, ou taux annuel × capital × quotité ÷ 12. */
function estimateMonthlyInsurance(mode: InsuranceMode, insuranceMonthlyCents: number, ratePercent: number | null, quotityPercent: number, principalCents: number, remainingCents: number): number {
  if (mode === 'FIXED' || ratePercent === null) {
    return insuranceMonthlyCents;
  }
  const base = mode === 'PERCENT_INITIAL' ? principalCents : remainingCents;
  return Math.round((base * ratePercent * quotityPercent) / 120000);
}

/** Lit la vérification de la mensualité ; tout ce qui est illisible devient « inconnu » (jamais une fausse alerte). */
export function parsePaymentCheck(raw: unknown): PaymentCheck {
  const source = asObject(raw);
  if (source.status !== 'OK' && source.status !== 'GAP') {
    return UNKNOWN_PAYMENT_CHECK;
  }
  const expected = isNumber(source.expectedMonthlyPaymentCents) ? Math.max(0, Math.round(source.expectedMonthlyPaymentCents)) : null;
  return {
    status: source.status,
    expectedMonthlyPaymentCents: expected,
    differenceCents: isNumber(source.differenceCents) ? Math.round(source.differenceCents) : null,
    differencePercent: isNumber(source.differencePercent) ? Math.round(source.differencePercent) : null,
  };
}

/** Lit un crédit ; `null` si l'essentiel (id, nom, capital emprunté) manque. Ce qui manque est recalculé plutôt que supposé. */
export function parseDebt(raw: unknown): Debt | null {
  const item = asObject(raw);
  if (typeof item.id !== 'string' || typeof item.name !== 'string' || !isNumber(item.principalCents)) {
    return null;
  }
  const principalCents = asCents(item.principalCents);
  const remainingCents = isNumber(item.remainingCents) ? asCents(item.remainingCents) : principalCents;
  const monthsRemaining = asMonths(item.monthsRemaining);
  const payoffDate = asDate(item.payoffDate);
  // Le contrat ajoute `neverPaidOff: true` dans ce cas : on ne le devine pas, pour ne jamais lancer une fausse alerte.
  const neverPaidOff = item.neverPaidOff === true;
  const insuranceMonthlyCents = asCents(item.insuranceMonthlyCents);
  const insuranceMode = insuranceModeOf(item.insuranceMode);
  const insuranceRatePercent = isNumber(item.insuranceRatePercent) ? Math.max(0, item.insuranceRatePercent) : null;
  const insuranceQuotityPercent = asQuotity(item.insuranceQuotityPercent);
  const monthlyPaymentCents = asCents(item.monthlyPaymentCents);
  const monthlyInsuranceCents = isNumber(item.monthlyInsuranceCents)
    ? asCents(item.monthlyInsuranceCents)
    : estimateMonthlyInsurance(insuranceMode, insuranceMonthlyCents, insuranceRatePercent, insuranceQuotityPercent, principalCents, remainingCents);
  const computedShare = principalCents > 0 ? Math.floor(((principalCents - Math.min(remainingCents, principalCents)) / principalCents) * 100) : 0;
  return {
    id: item.id,
    spaceId: typeof item.spaceId === 'string' ? item.spaceId : '',
    name: item.name,
    kind: kindOf(item.kind),
    principalCents,
    remainingCents,
    annualRatePercent: isNumber(item.annualRatePercent) ? Math.max(0, item.annualRatePercent) : 0,
    monthlyPaymentCents,
    startDate: asDate(item.startDate) ?? '',
    paymentDay: isNumber(item.paymentDay) ? Math.trunc(item.paymentDay) : MIN_PAYMENT_DAY,
    insuranceMonthlyCents,
    lender: asText(item.lender).trim(),
    contractReference: asText(item.contractReference).trim(),
    initialTermMonths: asTermMonths(item.initialTermMonths),
    rateType: rateTypeOf(item.rateType),
    insuranceMode,
    insuranceRatePercent,
    insuranceQuotityPercent,
    feesCents: asCents(item.feesCents),
    guaranteeKind: guaranteeKindOf(item.guaranteeKind),
    guaranteeCents: asCents(item.guaranteeCents),
    notes: asText(item.notes),
    monthlyInsuranceCents,
    monthlyTotalCents: isNumber(item.monthlyTotalCents) ? asCents(item.monthlyTotalCents) : monthlyPaymentCents + monthlyInsuranceCents,
    remainingInsuranceCents: neverPaidOff ? null : asNullableCents(item.remainingInsuranceCents),
    remainingCostCents: neverPaidOff ? null : asNullableCents(item.remainingCostCents),
    paymentCheck: parsePaymentCheck(item.paymentCheck),
    monthsRemaining: neverPaidOff ? null : monthsRemaining,
    payoffDate: neverPaidOff ? null : payoffDate,
    totalInterestRemainingCents: neverPaidOff ? null : asNullableCents(item.totalInterestRemainingCents),
    paidSharePercent: isNumber(item.paidSharePercent) ? Math.min(100, Math.max(0, Math.trunc(item.paidSharePercent))) : Math.min(100, Math.max(0, computedShare)),
    neverPaidOff,
    archived: item.archived === true,
    recurringId: typeof item.recurringId === 'string' && item.recurringId !== '' ? item.recurringId : null,
  };
}

export function parseDebts(raw: unknown): Debt[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const debts: Debt[] = [];
  for (const entry of raw as unknown[]) {
    const debt = parseDebt(entry);
    if (debt) {
      debts.push(debt);
    }
  }
  return sortDebts(debts);
}

function parseLenderSummaries(raw: unknown): LenderSummary[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const entries: LenderSummary[] = [];
  for (const entry of raw as unknown[]) {
    const item = asObject(entry);
    entries.push({
      lender: asText(item.lender).trim(),
      activeCount: isNumber(item.activeCount) ? Math.max(0, Math.trunc(item.activeCount)) : 0,
      remainingCents: asCents(item.remainingCents),
      monthlyTotalCents: asCents(item.monthlyTotalCents),
    });
  }
  // Le serveur trie déjà par capital restant ; on ne s'y fie pas.
  return entries.sort((a, b) => b.remainingCents - a.remainingCents || a.lender.localeCompare(b.lender, 'fr'));
}

export function parseDebtsSummary(raw: unknown): DebtsSummary {
  const source = asObject(raw);
  return {
    activeCount: isNumber(source.activeCount) ? Math.max(0, Math.trunc(source.activeCount)) : 0,
    totalRemainingCents: asCents(source.totalRemainingCents),
    totalMonthlyCents: asCents(source.totalMonthlyCents),
    debtToIncomePercent: isNumber(source.debtToIncomePercent) ? Math.max(0, Math.round(source.debtToIncomePercent)) : null,
    totalMonthlyInsuranceCents: asCents(source.totalMonthlyInsuranceCents),
    totalRemainingCostCents: asNullableCents(source.totalRemainingCostCents),
    byLender: parseLenderSummaries(source.byLender),
  };
}

function parseScenario(raw: unknown): WhatIfScenario {
  const source = asObject(raw);
  return {
    monthsRemaining: asMonths(source.monthsRemaining),
    totalInterestRemainingCents: asNullableCents(source.totalInterestRemainingCents),
    payoffDate: asDate(source.payoffDate),
  };
}

/** Lit la simulation ; `null` si ni le scénario de référence ni le scénario simulé ne sont présents. Les gains ne sont jamais négatifs. */
export function parseWhatIf(raw: unknown): WhatIfResult | null {
  const source = asObject(raw);
  if (source.baseline === undefined || source.scenario === undefined || source.baseline === null || source.scenario === null) {
    return null;
  }
  const baseline = parseScenario(source.baseline);
  const scenario = parseScenario(source.scenario);
  const interestSaved =
    isNumber(source.interestSavedCents)
      ? source.interestSavedCents
      : baseline.totalInterestRemainingCents !== null && scenario.totalInterestRemainingCents !== null
        ? baseline.totalInterestRemainingCents - scenario.totalInterestRemainingCents
        : 0;
  const monthsSaved =
    isNumber(source.monthsSaved) ? source.monthsSaved : baseline.monthsRemaining !== null && scenario.monthsRemaining !== null ? baseline.monthsRemaining - scenario.monthsRemaining : 0;
  return {
    baseline,
    scenario,
    interestSavedCents: Math.max(0, Math.round(interestSaved)),
    monthsSaved: Math.max(0, Math.trunc(monthsSaved)),
    insuranceSavedCents: asNullableCents(source.insuranceSavedCents),
    note: typeof source.note === 'string' && source.note.trim() !== '' ? source.note : DEFAULT_WHAT_IF_NOTE,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Tri et regroupement
// ---------------------------------------------------------------------------------------------------------------------

/** Les crédits en cours d'abord (ceux qui ne diminuent pas en tête, puis le plus gros capital restant), les archivés à la fin. */
export function sortDebts(debts: readonly Debt[]): Debt[] {
  return [...debts].sort((a, b) => {
    if (a.archived !== b.archived) {
      return a.archived ? 1 : -1;
    }
    if (a.neverPaidOff !== b.neverPaidOff) {
      return a.neverPaidOff ? -1 : 1;
    }
    if (a.remainingCents !== b.remainingCents) {
      return b.remainingCents - a.remainingCents;
    }
    return a.name.localeCompare(b.name, 'fr');
  });
}

export const activeDebts = (debts: readonly Debt[]): Debt[] => debts.filter((debt) => !debt.archived);
export const archivedDebts = (debts: readonly Debt[]): Debt[] => debts.filter((debt) => debt.archived);

// ---------------------------------------------------------------------------------------------------------------------
// Libellés
// ---------------------------------------------------------------------------------------------------------------------

const RATE_FORMAT = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** 3.9 → « 3,9 % », 0 → « 0 % ». */
export function formatRate(percent: number): string {
  return `${RATE_FORMAT.format(percent)} %`;
}

/** 38 → « 38 mois », 1 → « 1 mois », 0 → « moins d’un mois ». */
export function formatMonths(months: number): string {
  if (months <= 0) {
    return 'moins d’un mois';
  }
  return months > 1 ? `${months} mois` : '1 mois';
}

/** 38 → « 3 ans et 2 mois » ; en dessous d'un an, la durée en mois suffit (renvoie `null`). */
export function formatYearsAndMonths(months: number): string | null {
  if (months < 12) {
    return null;
  }
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearText = years > 1 ? `${years} ans` : '1 an';
  return rest === 0 ? yearText : `${yearText} et ${rest} mois`;
}

/** « dans 38 mois (3 ans et 2 mois) ». */
export function describeTimeLeft(months: number): string {
  const detail = formatYearsAndMonths(months);
  return months <= 0 ? 'ce mois-ci' : `dans ${formatMonths(months)}${detail ? ` (${detail})` : ''}`;
}

export const isRepaid = (debt: Pick<Debt, 'remainingCents'>): boolean => debt.remainingCents <= 0;

/** « Fin prévue le 5 décembre 2029 · dans 38 mois (3 ans et 2 mois) » ; `null` si la dette ne diminue pas ou est soldée. */
export function describePayoff(debt: Pick<Debt, 'payoffDate' | 'monthsRemaining' | 'remainingCents' | 'neverPaidOff'>): string | null {
  if (debt.neverPaidOff || debt.remainingCents <= 0 || debt.payoffDate === null || debt.monthsRemaining === null) {
    return null;
  }
  return `Fin prévue le ${formatLongDateInput(debt.payoffDate)} · ${describeTimeLeft(debt.monthsRemaining)}`;
}

/** « 320 € par mois, plus 15 € d’assurance » (l'assurance n'est mentionnée que si elle existe). */
export function describeMonthly(debt: Pick<Debt, 'monthlyPaymentCents' | 'monthlyInsuranceCents'>): string {
  const base = `${formatCentsShort(debt.monthlyPaymentCents)} par mois`;
  return debt.monthlyInsuranceCents > 0 ? `${base}, plus ${formatCentsShort(debt.monthlyInsuranceCents)} d’assurance` : base;
}

/** Ce que l'on prélève vraiment chaque mois : mensualité et assurance. */
export const totalMonthlyCents = (debt: Pick<Debt, 'monthlyPaymentCents' | 'monthlyInsuranceCents'>): number => debt.monthlyPaymentCents + debt.monthlyInsuranceCents;

/** « 335 € par mois au total » ; `null` sans assurance (la mensualité suffit alors). */
export function describeMonthlyTotal(debt: Pick<Debt, 'monthlyPaymentCents' | 'monthlyInsuranceCents'>): string | null {
  return debt.monthlyInsuranceCents > 0 ? `${formatCentsShort(totalMonthlyCents(debt))} par mois au total` : null;
}

/** « 240 mois (20 ans) ». */
export function describeTerm(months: number): string {
  const detail = formatYearsAndMonths(months);
  return `${formatMonths(months)}${detail ? ` (${detail})` : ''}`;
}

export const RATE_TYPE_HELP = 'Les calculs supposent un taux fixe ; avec un taux variable ou révisable, ils restent des estimations.';

export const rateTypeLabel = (rateType: RateType | null): string => (rateType === null ? RATE_TYPE_UNKNOWN_LABEL : RATE_TYPE_LABEL[rateType]);

/** L'avertissement des taux qui bougent ; `null` pour un taux fixe ou non précisé. */
export function rateTypeWarning(rateType: RateType | null): string | null {
  return rateType === 'VARIABLE' || rateType === 'ADJUSTABLE'
    ? `Taux ${RATE_TYPE_LABEL[rateType].toLowerCase()} : les calculs supposent un taux fixe, ils ne sont donc que des estimations.`
    : null;
}

/** « 1,2 % du capital emprunté par an (environ 15 € par mois) », « 15 € par mois », « Aucune assurance renseignée ». */
export function describeInsurance(
  debt: Pick<Debt, 'insuranceMode' | 'insuranceRatePercent' | 'insuranceQuotityPercent' | 'monthlyInsuranceCents' | 'insuranceMonthlyCents'>,
): string {
  if (debt.insuranceMode === 'FIXED' || debt.insuranceRatePercent === null) {
    return debt.monthlyInsuranceCents > 0 ? `${formatCentsShort(debt.monthlyInsuranceCents)} par mois` : 'Aucune assurance renseignée';
  }
  const base = debt.insuranceMode === 'PERCENT_INITIAL' ? 'du capital emprunté' : 'du capital restant dû';
  const quotity = debt.insuranceQuotityPercent !== DEFAULT_QUOTITY_PERCENT ? `, quotité ${debt.insuranceQuotityPercent} %` : '';
  return `${formatRate(debt.insuranceRatePercent)} ${base} par an${quotity} (environ ${formatCentsShort(debt.monthlyInsuranceCents)} par mois)`;
}

/** « Caution · 1 500 € », « Aucune » ; un montant sans type est tout de même écrit. */
export function describeGuarantee(debt: Pick<Debt, 'guaranteeKind' | 'guaranteeCents'>): string {
  const label = GUARANTEE_KIND_LABEL[debt.guaranteeKind];
  return debt.guaranteeCents > 0 ? `${label} · ${formatCentsShort(debt.guaranteeCents)}` : label;
}

/** Le prêteur tel qu'on l'affiche dans les regroupements. */
export const LENDER_UNKNOWN_LABEL = 'Prêteur non précisé';
export const lenderLabel = (lender: string): string => (lender.trim() === '' ? LENDER_UNKNOWN_LABEL : lender.trim());

/** Les prêteurs déjà saisis dans l'espace (sans doublon, sans tenir compte de la casse), pour les suggestions du formulaire. */
export function knownLenders(debts: readonly Pick<Debt, 'lender'>[]): string[] {
  const seen = new Map<string, string>();
  for (const { lender } of debts) {
    const name = lender.trim();
    if (name !== '' && !seen.has(name.toLocaleLowerCase('fr'))) {
      seen.set(name.toLocaleLowerCase('fr'), name);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'fr'));
}

export type PaymentCheckLevel = 'ok' | 'gap' | 'unknown';

export interface PaymentCheckMessage {
  level: PaymentCheckLevel;
  text: string;
}

/**
 * Le message de la vérification de mensualité. Un écart invite à revérifier la saisie ou la durée, jamais à renégocier ou
 * racheter le prêt. Quand la vérification est impossible, on dit seulement ce qui manque, sans rien d'alarmant.
 */
export function describePaymentCheck(debt: Pick<Debt, 'paymentCheck' | 'monthlyPaymentCents' | 'initialTermMonths' | 'rateType'>): PaymentCheckMessage {
  const { paymentCheck } = debt;
  if (paymentCheck.status === 'GAP') {
    const entered = formatCentsShort(debt.monthlyPaymentCents);
    const expected = paymentCheck.expectedMonthlyPaymentCents;
    const origin = 'ce que donneraient le capital, le taux et la durée d’origine';
    return {
      level: 'gap',
      text:
        expected === null
          ? `La mensualité saisie (${entered}) ne correspond pas à ${origin} : vérifiez votre saisie ou la durée.`
          : `La mensualité saisie (${entered}) ne correspond pas à ${origin} (${formatCentsShort(expected)}) : vérifiez votre saisie ou la durée.`,
    };
  }
  if (paymentCheck.status === 'OK') {
    return { level: 'ok', text: 'La mensualité saisie correspond au capital, au taux et à la durée d’origine.' };
  }
  if (debt.rateType === 'VARIABLE' || debt.rateType === 'ADJUSTABLE') {
    return { level: 'unknown', text: 'La mensualité n’est pas vérifiée : avec un taux variable ou révisable, on ne peut pas la recalculer à partir du prêt d’origine.' };
  }
  if (debt.initialTermMonths === null) {
    return { level: 'unknown', text: 'Pour vérifier la mensualité, indiquez la durée initiale du prêt (modifiez le crédit).' };
  }
  return { level: 'unknown', text: 'La mensualité n’a pas pu être vérifiée avec les informations disponibles.' };
}

export const describePaidShare = (debt: Pick<Debt, 'paidSharePercent'>): string => `Déjà remboursé : ${debt.paidSharePercent} %`;

/** « Déjà remboursé : 25 % — 3 800 € sur 15 000 € » : le texte lu par les lecteurs d'écran et affiché sous la barre. */
export function describePaidProgress(debt: Pick<Debt, 'paidSharePercent' | 'principalCents' | 'remainingCents'>): string {
  const paid = Math.max(0, debt.principalCents - debt.remainingCents);
  return `Déjà remboursé : ${debt.paidSharePercent} % — ${formatCentsShort(paid)} sur ${formatCentsShort(debt.principalCents)}`;
}

/** Les intérêts d'un mois sur le capital restant (estimation : capital × taux ÷ 12, au centime). */
export function monthlyInterestCents(debt: Pick<Debt, 'remainingCents' | 'annualRatePercent'>): number {
  return Math.round((debt.remainingCents * debt.annualRatePercent) / 1200);
}

/** Le message qui met en avant un crédit dont la mensualité ne couvre pas les intérêts. */
export function describeNeverPaidOff(debt: Pick<Debt, 'remainingCents' | 'annualRatePercent' | 'monthlyPaymentCents'>): string {
  const interest = monthlyInterestCents(debt);
  return (
    `Cette mensualité ne couvre pas les intérêts : le capital restant ne diminue pas. Les intérêts d’un mois sont d’environ ${formatCentsShort(interest)} ` +
    `alors que la mensualité est de ${formatCentsShort(debt.monthlyPaymentCents)}. Vérifiez les chiffres saisis (capital restant, taux, mensualité) ou voyez avec votre banque.`
  );
}

export const NEVER_PAID_OFF_LABEL = 'La dette ne diminue pas';

// ---------------------------------------------------------------------------------------------------------------------
// Synthèse et taux d'endettement
// ---------------------------------------------------------------------------------------------------------------------

export type DebtRatioLevel = 'unknown' | 'below' | 'at' | 'above';

export const DEBT_RATIO_LABEL: Record<DebtRatioLevel, string> = {
  unknown: 'Non calculé',
  below: 'Sous le repère',
  at: 'Au niveau du repère',
  above: 'Au-dessus du repère',
};

export function debtRatioLevel(percent: number | null): DebtRatioLevel {
  if (percent === null) {
    return 'unknown';
  }
  if (percent > DEBT_RATIO_REFERENCE_PERCENT) {
    return 'above';
  }
  return percent === DEBT_RATIO_REFERENCE_PERCENT ? 'at' : 'below';
}

/** La phrase qui accompagne le taux : toujours écrite, la couleur n'est qu'un renfort. */
export function describeDebtRatio(percent: number | null): string {
  switch (debtRatioLevel(percent)) {
    case 'unknown':
      return 'Le taux ne peut pas être calculé : renseignez votre revenu net mensuel dans la page Foyer.';
    case 'below':
      return `${percent} % de vos revenus partent en mensualités : c’est sous le repère courant de ${DEBT_RATIO_REFERENCE_PERCENT} %.`;
    case 'at':
      return `${percent} % de vos revenus partent en mensualités : c’est pile le repère courant de ${DEBT_RATIO_REFERENCE_PERCENT} %.`;
    default:
      return `${percent} % de vos revenus partent en mensualités : c’est au-dessus du repère courant de ${DEBT_RATIO_REFERENCE_PERCENT} %.`;
  }
}

export const DEBT_RATIO_EXPLANATION = `${DEBT_RATIO_REFERENCE_PERCENT} % est un repère souvent cité (par les banques et dans le cours), pas une règle de droit : le bon niveau dépend de votre situation. Le taux compte les mensualités et les assurances des crédits en cours, rapportées à vos revenus mensuels.`;

/** Position (0-100) d'un taux sur la jauge, qui va de 0 à 2 × le repère. */
export function ratioGaugePercent(percent: number): number {
  return Math.min(100, Math.max(0, Math.round((percent / (DEBT_RATIO_REFERENCE_PERCENT * 2)) * 100)));
}

// ---------------------------------------------------------------------------------------------------------------------
// Formulaire de crédit
// ---------------------------------------------------------------------------------------------------------------------

export type TermUnit = 'MONTHS' | 'YEARS';

export interface DebtFormValues {
  name: string;
  kind: DebtKind;
  /** Capital emprunté, en euros. */
  principal: string;
  /** Capital restant dû, en euros. */
  remaining: string;
  /** Taux annuel en pourcentage, virgule ou point. */
  rate: string;
  monthlyPayment: string;
  startDate: string;
  paymentDay: string;
  /** Identifiant du paiement récurrent, ou chaîne vide pour « Aucun ». */
  recurringId: string;
  lender: string;
  contractReference: string;
  /** Saisie de la durée initiale : en mois, ou en années et mois. Tout vide = non précisée. */
  termUnit: TermUnit;
  termMonths: string;
  termYears: string;
  termExtraMonths: string;
  /** Chaîne vide = non précisé. */
  rateType: RateType | '';
  insuranceMode: InsuranceMode;
  /** Montant mensuel fixe en euros (mode `FIXED`), vide = 0. */
  insurance: string;
  /** Taux annuel de l'assurance en pourcentage (modes en pourcentage). */
  insuranceRate: string;
  /** Vide = 100. */
  insuranceQuotity: string;
  /** Frais de dossier en euros, vide = 0. */
  fees: string;
  guaranteeKind: GuaranteeKind;
  /** Frais de garantie en euros, vide = 0. */
  guarantee: string;
  notes: string;
}

export interface DebtFormErrors {
  name?: string;
  principal?: string;
  remaining?: string;
  rate?: string;
  monthlyPayment?: string;
  insurance?: string;
  startDate?: string;
  paymentDay?: string;
  lender?: string;
  contractReference?: string;
  term?: string;
  insuranceRate?: string;
  insuranceQuotity?: string;
  fees?: string;
  guarantee?: string;
  notes?: string;
}

export type DebtFormResult = { ok: true; payload: DebtPayload } | { ok: false; errors: DebtFormErrors };

export const REMAINING_HELP = 'Le capital restant figure sur votre tableau d’amortissement ou sur le relevé de la banque.';
export const QUOTITY_HELP = 'La part du prêt couverte par l’assurance. Deux emprunteurs assurés chacun à 100 % : 200 %.';
export const NOTES_HELP = 'Par exemple les conditions de remboursement anticipé. N’y mettez jamais de numéro de compte ni de mot de passe.';
export const GUARANTEE_NONE_ERROR = 'Choisissez le type de garantie (caution, hypothèque…) pour y associer un montant, ou laissez le montant vide.';

const AMOUNT_HINT = 'Montant invalide : utilisez des chiffres et au plus 2 décimales (ex. 15 000 ou 320,50).';

export function emptyDebtForm(now: Date = new Date()): DebtFormValues {
  const today = todayInputValue(now);
  return {
    name: '',
    kind: 'CONSUMER',
    principal: '',
    remaining: '',
    rate: '',
    monthlyPayment: '',
    startDate: today,
    paymentDay: String(Math.min(MAX_PAYMENT_DAY, Math.max(MIN_PAYMENT_DAY, now.getDate()))),
    recurringId: '',
    lender: '',
    contractReference: '',
    termUnit: 'MONTHS',
    termMonths: '',
    termYears: '',
    termExtraMonths: '',
    rateType: '',
    insuranceMode: 'FIXED',
    insurance: '',
    insuranceRate: '',
    insuranceQuotity: String(DEFAULT_QUOTITY_PERCENT),
    fees: '',
    guaranteeKind: 'NONE',
    guarantee: '',
    notes: '',
  };
}

const percentToInput = (percent: number): string => String(percent).replace('.', ',');
const optionalCentsToInput = (cents: number): string => (cents === 0 ? '' : centsToInputValue(cents));

export function debtToForm(debt: Debt): DebtFormValues {
  const term = debt.initialTermMonths;
  const inYears = term !== null && term >= 12;
  return {
    name: debt.name,
    kind: debt.kind,
    principal: centsToInputValue(debt.principalCents),
    remaining: centsToInputValue(debt.remainingCents),
    rate: percentToInput(debt.annualRatePercent),
    monthlyPayment: centsToInputValue(debt.monthlyPaymentCents),
    startDate: debt.startDate,
    paymentDay: String(debt.paymentDay),
    recurringId: debt.recurringId ?? '',
    lender: debt.lender,
    contractReference: debt.contractReference,
    termUnit: inYears ? 'YEARS' : 'MONTHS',
    termMonths: term !== null && !inYears ? String(term) : '',
    termYears: term !== null && inYears ? String(Math.floor(term / 12)) : '',
    termExtraMonths: term !== null && inYears && term % 12 !== 0 ? String(term % 12) : '',
    rateType: debt.rateType ?? '',
    insuranceMode: debt.insuranceMode,
    insurance: debt.insuranceMode === 'FIXED' ? optionalCentsToInput(debt.insuranceMonthlyCents) : '',
    insuranceRate: debt.insuranceRatePercent === null ? '' : percentToInput(debt.insuranceRatePercent),
    insuranceQuotity: String(debt.insuranceQuotityPercent),
    fees: optionalCentsToInput(debt.feesCents),
    guaranteeKind: debt.guaranteeKind,
    guarantee: optionalCentsToInput(debt.guaranteeCents),
    notes: debt.notes,
  };
}

/** Y a-t-il quelque chose dans les champs facultatifs du contrat ? Sert à ouvrir ce bloc d'office à la modification. */
export function hasContractDetails(values: Pick<DebtFormValues, 'contractReference' | 'fees' | 'guaranteeKind' | 'guarantee' | 'notes'>): boolean {
  return values.contractReference.trim() !== '' || values.fees.trim() !== '' || values.guaranteeKind !== 'NONE' || values.guarantee.trim() !== '' || values.notes.trim() !== '';
}

const RATE_PATTERN = /^\d+(?:[.,]\d{0,2})?$|^[.,]\d{1,2}$/;

/** « 3,9 », « 3.90 », « 4 % » → 3.9 / 3.9 / 4 ; `null` si ce n'est pas un nombre positif à 2 décimales au plus. */
export function parseRatePercent(input: string): number | null {
  const cleaned = input.replace(/[\s  ]/g, '').replace(/%/g, '');
  if (!RATE_PATTERN.test(cleaned)) {
    return null;
  }
  const value = Number(cleaned.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function parsePaymentDay(input: string): number | null {
  const trimmed = input.trim();
  return /^\d{1,2}$/.test(trimmed) ? Number(trimmed) : null;
}

const WHOLE_NUMBER = /^\d{1,4}$/;

export const TERM_ERROR = `La durée doit être comprise entre ${MIN_TERM_MONTHS} et ${MAX_TERM_MONTHS} mois (50 ans) ; laissez vide si vous ne la connaissez pas.`;

type TermResult = { ok: true; months: number | null } | { ok: false };

/** La durée initiale en mois, depuis la saisie en mois ou en années et mois. Tout vide : non précisée (`null`). */
export function parseInitialTerm(values: Pick<DebtFormValues, 'termUnit' | 'termMonths' | 'termYears' | 'termExtraMonths'>): TermResult {
  if (values.termUnit === 'MONTHS') {
    const text = values.termMonths.trim();
    if (text === '') {
      return { ok: true, months: null };
    }
    const months = WHOLE_NUMBER.test(text) ? Number(text) : NaN;
    return months >= MIN_TERM_MONTHS && months <= MAX_TERM_MONTHS ? { ok: true, months } : { ok: false };
  }
  const yearsText = values.termYears.trim();
  const extraText = values.termExtraMonths.trim();
  if (yearsText === '' && extraText === '') {
    return { ok: true, months: null };
  }
  if ((yearsText !== '' && !WHOLE_NUMBER.test(yearsText)) || (extraText !== '' && !WHOLE_NUMBER.test(extraText))) {
    return { ok: false };
  }
  const total = Number(yearsText || '0') * 12 + Number(extraText || '0');
  return total >= MIN_TERM_MONTHS && total <= MAX_TERM_MONTHS ? { ok: true, months: total } : { ok: false };
}

/** Un montant facultatif en euros : vide = 0, `null` si illisible. */
const optionalAmount = (input: string): number | null => (input.trim() === '' ? 0 : parseAmountToCents(input));

export function buildDebtPayload(values: DebtFormValues): DebtFormResult {
  const errors: DebtFormErrors = {};

  const name = values.name.trim();
  if (name === '') {
    errors.name = 'Donnez un nom à ce crédit (ex. Prêt auto).';
  } else if (name.length > MAX_DEBT_NAME_LENGTH) {
    errors.name = `Le nom est trop long (${MAX_DEBT_NAME_LENGTH} caractères au plus).`;
  }

  const lender = values.lender.trim();
  if (lender.length > MAX_LENDER_LENGTH) {
    errors.lender = `Le nom du prêteur est trop long (${MAX_LENDER_LENGTH} caractères au plus).`;
  }

  const contractReference = values.contractReference.trim();
  if (contractReference.length > MAX_CONTRACT_REFERENCE_LENGTH) {
    errors.contractReference = `La référence est trop longue (${MAX_CONTRACT_REFERENCE_LENGTH} caractères au plus).`;
  }

  const principalCents = parseAmountToCents(values.principal);
  if (values.principal.trim() === '') {
    errors.principal = 'Indiquez le capital emprunté (la somme prêtée au départ).';
  } else if (principalCents === null) {
    errors.principal = AMOUNT_HINT;
  } else if (principalCents === 0) {
    errors.principal = 'Le capital emprunté doit être supérieur à 0.';
  }

  const remainingCents = parseAmountToCents(values.remaining);
  if (values.remaining.trim() === '') {
    errors.remaining = 'Indiquez le capital restant dû (voir l’aide ci-dessus).';
  } else if (remainingCents === null) {
    errors.remaining = AMOUNT_HINT;
  } else if (principalCents !== null && principalCents > 0 && remainingCents > principalCents) {
    errors.remaining = 'Le capital restant ne peut pas dépasser le capital emprunté.';
  }

  const rate = parseRatePercent(values.rate);
  if (values.rate.trim() === '') {
    errors.rate = 'Indiquez le taux annuel (0 si le crédit est sans intérêts).';
  } else if (rate === null) {
    errors.rate = 'Taux invalide : utilisez des chiffres avec au plus 2 décimales, virgule ou point (ex. 3,9).';
  } else if (rate > MAX_RATE_PERCENT) {
    errors.rate = `Le taux doit être compris entre 0 et ${MAX_RATE_PERCENT} %.`;
  }

  const monthlyCents = parseAmountToCents(values.monthlyPayment);
  if (values.monthlyPayment.trim() === '') {
    errors.monthlyPayment = 'Indiquez la mensualité (hors assurance).';
  } else if (monthlyCents === null) {
    errors.monthlyPayment = AMOUNT_HINT;
  } else if (monthlyCents === 0) {
    errors.monthlyPayment = 'La mensualité doit être supérieure à 0.';
  }

  const term = parseInitialTerm(values);
  if (!term.ok) {
    errors.term = TERM_ERROR;
  }

  // Assurance : seuls les champs du mode choisi comptent ; les autres sont ignorés (et envoyés vides).
  let insuranceCents: number | null = 0;
  let insuranceRate: number | null = null;
  let insuranceQuotity = DEFAULT_QUOTITY_PERCENT;
  if (values.insuranceMode === 'FIXED') {
    insuranceCents = optionalAmount(values.insurance);
    if (insuranceCents === null) {
      errors.insurance = 'Montant invalide : utilisez des chiffres et au plus 2 décimales, ou laissez vide s’il n’y a pas d’assurance.';
    }
  } else {
    if (values.insuranceRate.trim() === '') {
      errors.insuranceRate = 'Indiquez le taux annuel de l’assurance (ex. 0,30).';
    } else {
      insuranceRate = parseRatePercent(values.insuranceRate);
      if (insuranceRate === null) {
        errors.insuranceRate = 'Taux invalide : utilisez des chiffres avec au plus 2 décimales, virgule ou point (ex. 0,30).';
      } else if (insuranceRate > MAX_INSURANCE_RATE_PERCENT) {
        errors.insuranceRate = `Le taux de l’assurance doit être compris entre 0 et ${MAX_INSURANCE_RATE_PERCENT} %.`;
      }
    }
    const quotityText = values.insuranceQuotity.trim();
    if (quotityText !== '') {
      const quotity = /^\d{1,3}$/.test(quotityText) ? Number(quotityText) : NaN;
      if (quotity >= MIN_QUOTITY_PERCENT && quotity <= MAX_QUOTITY_PERCENT) {
        insuranceQuotity = quotity;
      } else {
        errors.insuranceQuotity = `La quotité doit être un nombre entier entre ${MIN_QUOTITY_PERCENT} et ${MAX_QUOTITY_PERCENT} % (100 % par défaut).`;
      }
    }
  }

  const feesCents = optionalAmount(values.fees);
  if (feesCents === null) {
    errors.fees = 'Montant invalide : utilisez des chiffres et au plus 2 décimales, ou laissez vide.';
  }

  const guaranteeCents = optionalAmount(values.guarantee);
  if (guaranteeCents === null) {
    errors.guarantee = 'Montant invalide : utilisez des chiffres et au plus 2 décimales, ou laissez vide.';
  } else if (guaranteeCents > 0 && values.guaranteeKind === 'NONE') {
    errors.guarantee = GUARANTEE_NONE_ERROR;
  }

  if (values.notes.trim().length > MAX_NOTES_LENGTH) {
    errors.notes = `Les notes sont trop longues (${MAX_NOTES_LENGTH} caractères au plus).`;
  }

  if (!isValidDateInput(values.startDate)) {
    errors.startDate = 'Choisissez la date de début du crédit.';
  }

  const paymentDay = parsePaymentDay(values.paymentDay);
  if (paymentDay === null || paymentDay < MIN_PAYMENT_DAY || paymentDay > MAX_PAYMENT_DAY) {
    errors.paymentDay = `Choisissez un jour de prélèvement entre ${MIN_PAYMENT_DAY} et ${MAX_PAYMENT_DAY}.`;
  }

  if (
    Object.keys(errors).length > 0 ||
    principalCents === null ||
    remainingCents === null ||
    rate === null ||
    monthlyCents === null ||
    insuranceCents === null ||
    feesCents === null ||
    guaranteeCents === null ||
    !term.ok ||
    paymentDay === null
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    payload: {
      name,
      kind: values.kind,
      principalCents,
      remainingCents,
      annualRatePercent: rate,
      monthlyPaymentCents: monthlyCents,
      startDate: values.startDate,
      paymentDay,
      insuranceMonthlyCents: insuranceCents,
      recurringId: values.recurringId === '' ? null : values.recurringId,
      lender,
      contractReference,
      initialTermMonths: term.months,
      rateType: values.rateType === '' ? null : values.rateType,
      insuranceMode: values.insuranceMode,
      insuranceRatePercent: insuranceRate,
      insuranceQuotityPercent: insuranceQuotity,
      feesCents,
      guaranteeKind: values.guaranteeKind,
      guaranteeCents,
      notes: values.notes.trim(),
    },
  };
}

export function debtToPayload(debt: Debt, overrides: Partial<DebtPayload> = {}): DebtPayload {
  return {
    name: debt.name,
    kind: debt.kind,
    principalCents: debt.principalCents,
    remainingCents: debt.remainingCents,
    annualRatePercent: debt.annualRatePercent,
    monthlyPaymentCents: debt.monthlyPaymentCents,
    startDate: debt.startDate,
    paymentDay: debt.paymentDay,
    insuranceMonthlyCents: debt.insuranceMonthlyCents,
    recurringId: debt.recurringId,
    lender: debt.lender,
    contractReference: debt.contractReference,
    initialTermMonths: debt.initialTermMonths,
    rateType: debt.rateType,
    insuranceMode: debt.insuranceMode,
    insuranceRatePercent: debt.insuranceRatePercent,
    insuranceQuotityPercent: debt.insuranceQuotityPercent,
    feesCents: debt.feesCents,
    guaranteeKind: debt.guaranteeKind,
    guaranteeCents: debt.guaranteeCents,
    notes: debt.notes,
    archived: debt.archived,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Paiement récurrent lié
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Les paiements récurrents proposés pour représenter la mensualité : les dépenses actives de l'espace, plus celui qui est
 * déjà lié (même s'il est devenu inactif ou n'est plus une dépense), pour ne pas le perdre en modifiant le crédit.
 */
export function linkableRecurring(items: readonly RecurringPayment[], currentId: string | null): RecurringPayment[] {
  return items.filter((item) => (item.kind === 'EXPENSE' && item.active) || item.id === currentId);
}

// ---------------------------------------------------------------------------------------------------------------------
// Simulateur « Et si je remboursais plus vite ? »
// ---------------------------------------------------------------------------------------------------------------------

export interface WhatIfFormValues {
  extra: string;
  lumpSum: string;
}

export interface WhatIfFormErrors {
  extra?: string;
  lumpSum?: string;
  both?: string;
}

export type WhatIfFormResult = { ok: true; query: WhatIfQuery } | { ok: false; errors: WhatIfFormErrors };

export const EMPTY_WHAT_IF_FORM: WhatIfFormValues = { extra: '', lumpSum: '' };

export const WHAT_IF_NEEDS_ONE = 'Indiquez au moins un montant supérieur à 0 : un versement supplémentaire par mois, ou un remboursement partiel immédiat.';

/** Deux montants facultatifs en euros, dont au moins un est supérieur à 0. */
export function buildWhatIfQuery(values: WhatIfFormValues): WhatIfFormResult {
  const errors: WhatIfFormErrors = {};
  const extra = values.extra.trim() === '' ? 0 : parseAmountToCents(values.extra);
  const lumpSum = values.lumpSum.trim() === '' ? 0 : parseAmountToCents(values.lumpSum);
  if (extra === null) {
    errors.extra = AMOUNT_HINT;
  }
  if (lumpSum === null) {
    errors.lumpSum = AMOUNT_HINT;
  }
  if (extra !== null && lumpSum !== null && extra === 0 && lumpSum === 0) {
    errors.both = WHAT_IF_NEEDS_ONE;
  }
  if (Object.keys(errors).length > 0 || extra === null || lumpSum === null) {
    return { ok: false, errors };
  }
  return { ok: true, query: { extraMonthlyCents: extra, lumpSumCents: lumpSum } };
}

/** Durée d'un scénario : « 38 mois », ou une phrase si la dette ne diminue pas. */
export function describeScenarioDuration(scenario: WhatIfScenario): string {
  return scenario.monthsRemaining === null ? 'Jamais : la mensualité ne couvre pas les intérêts' : formatMonths(scenario.monthsRemaining);
}

export function describeScenarioEnd(scenario: WhatIfScenario): string {
  return scenario.payoffDate === null ? '—' : formatLongDateInput(scenario.payoffDate);
}

export function describeScenarioInterest(scenario: WhatIfScenario): string {
  return scenario.totalInterestRemainingCents === null ? '—' : formatCentsShort(scenario.totalInterestRemainingCents);
}

/** « environ 40 € d’assurance en moins » ; `null` quand il n'y a rien à dire (jamais de valeur négative). */
export function describeInsuranceSaved(insuranceSavedCents: number | null | undefined): string | null {
  return typeof insuranceSavedCents === 'number' && insuranceSavedCents > 0 ? `environ ${formatCentsShort(Math.round(insuranceSavedCents))} d’assurance en moins` : null;
}

/** « Vous économiseriez 270 € d’intérêts et 9 mois, et environ 40 € d’assurance en moins. » Jamais de montant ni de durée négatifs. */
export function describeWhatIfSavings(
  result: Pick<WhatIfResult, 'baseline' | 'scenario' | 'interestSavedCents' | 'monthsSaved'> & Partial<Pick<WhatIfResult, 'insuranceSavedCents'>>,
): string {
  const interest = Math.max(0, result.interestSavedCents);
  const months = Math.max(0, result.monthsSaved);
  const insurance = describeInsuranceSaved(result.insuranceSavedCents);
  if (result.baseline.monthsRemaining === null && result.scenario.monthsRemaining !== null) {
    return `Avec ce remboursement, le crédit pourrait être soldé en ${formatMonths(result.scenario.monthsRemaining)}, alors qu’aujourd’hui la dette ne diminue pas.`;
  }
  if (interest === 0 && months === 0) {
    return insurance ? `Vous économiseriez ${insurance.replace(' en moins', '')}.` : 'Ce remboursement ne changerait presque rien : essayez un montant plus élevé.';
  }
  if (months === 0) {
    return `Vous économiseriez ${formatCentsShort(interest)} d’intérêts${insurance ? ` et ${insurance}` : ''}.`;
  }
  if (interest === 0) {
    return `Vous gagneriez ${formatMonths(months)}${insurance ? `, et ${insurance}` : ''}.`;
  }
  return `Vous économiseriez ${formatCentsShort(interest)} d’intérêts et ${formatMonths(months)}${insurance ? `, et ${insurance}` : ''}.`;
}
