import { centsToInputValue, formatCentsShort, parseAmountToCents } from './money';
import { formatLongDateInput, isValidDateInput, todayInputValue } from './month';
import { RecurringPayment } from './recurring';

export const MAX_DEBT_NAME_LENGTH = 60;
export const MIN_PAYMENT_DAY = 1;
export const MAX_PAYMENT_DAY = 28;
export const MAX_RATE_PERCENT = 100;

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
  insuranceMonthlyCents: number;
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
  archived?: boolean;
}

export interface DebtsSummary {
  activeCount: number;
  totalRemainingCents: number;
  totalMonthlyCents: number;
  /** `null` : revenus inconnus. */
  debtToIncomePercent: number | null;
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
  const computedShare = principalCents > 0 ? Math.floor(((principalCents - Math.min(remainingCents, principalCents)) / principalCents) * 100) : 0;
  return {
    id: item.id,
    spaceId: typeof item.spaceId === 'string' ? item.spaceId : '',
    name: item.name,
    kind: kindOf(item.kind),
    principalCents,
    remainingCents,
    annualRatePercent: isNumber(item.annualRatePercent) ? Math.max(0, item.annualRatePercent) : 0,
    monthlyPaymentCents: asCents(item.monthlyPaymentCents),
    startDate: asDate(item.startDate) ?? '',
    paymentDay: isNumber(item.paymentDay) ? Math.trunc(item.paymentDay) : MIN_PAYMENT_DAY,
    insuranceMonthlyCents: asCents(item.insuranceMonthlyCents),
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

export function parseDebtsSummary(raw: unknown): DebtsSummary {
  const source = asObject(raw);
  return {
    activeCount: isNumber(source.activeCount) ? Math.max(0, Math.trunc(source.activeCount)) : 0,
    totalRemainingCents: asCents(source.totalRemainingCents),
    totalMonthlyCents: asCents(source.totalMonthlyCents),
    debtToIncomePercent: isNumber(source.debtToIncomePercent) ? Math.max(0, Math.round(source.debtToIncomePercent)) : null,
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
export function describeMonthly(debt: Pick<Debt, 'monthlyPaymentCents' | 'insuranceMonthlyCents'>): string {
  const base = `${formatCentsShort(debt.monthlyPaymentCents)} par mois`;
  return debt.insuranceMonthlyCents > 0 ? `${base}, plus ${formatCentsShort(debt.insuranceMonthlyCents)} d’assurance` : base;
}

/** Ce que l'on prélève vraiment chaque mois : mensualité et assurance. */
export const totalMonthlyCents = (debt: Pick<Debt, 'monthlyPaymentCents' | 'insuranceMonthlyCents'>): number => debt.monthlyPaymentCents + debt.insuranceMonthlyCents;

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
  /** Vide = 0. */
  insurance: string;
  startDate: string;
  paymentDay: string;
  /** Identifiant du paiement récurrent, ou chaîne vide pour « Aucun ». */
  recurringId: string;
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
}

export type DebtFormResult = { ok: true; payload: DebtPayload } | { ok: false; errors: DebtFormErrors };

export const REMAINING_HELP = 'Le capital restant figure sur votre tableau d’amortissement ou sur le relevé de la banque.';

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
    insurance: '',
    startDate: today,
    paymentDay: String(Math.min(MAX_PAYMENT_DAY, Math.max(MIN_PAYMENT_DAY, now.getDate()))),
    recurringId: '',
  };
}

export function debtToForm(debt: Debt): DebtFormValues {
  return {
    name: debt.name,
    kind: debt.kind,
    principal: centsToInputValue(debt.principalCents),
    remaining: centsToInputValue(debt.remainingCents),
    rate: String(debt.annualRatePercent).replace('.', ','),
    monthlyPayment: centsToInputValue(debt.monthlyPaymentCents),
    insurance: debt.insuranceMonthlyCents === 0 ? '' : centsToInputValue(debt.insuranceMonthlyCents),
    startDate: debt.startDate,
    paymentDay: String(debt.paymentDay),
    recurringId: debt.recurringId ?? '',
  };
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

export function buildDebtPayload(values: DebtFormValues): DebtFormResult {
  const errors: DebtFormErrors = {};

  const name = values.name.trim();
  if (name === '') {
    errors.name = 'Donnez un nom à ce crédit (ex. Prêt auto).';
  } else if (name.length > MAX_DEBT_NAME_LENGTH) {
    errors.name = `Le nom est trop long (${MAX_DEBT_NAME_LENGTH} caractères au plus).`;
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

  const insuranceCents = values.insurance.trim() === '' ? 0 : parseAmountToCents(values.insurance);
  if (insuranceCents === null) {
    errors.insurance = 'Montant invalide : utilisez des chiffres et au plus 2 décimales, ou laissez vide s’il n’y a pas d’assurance.';
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

/** « Vous économiseriez 270 € d’intérêts et 9 mois. » Jamais de montant ni de durée négatifs. */
export function describeWhatIfSavings(result: Pick<WhatIfResult, 'baseline' | 'scenario' | 'interestSavedCents' | 'monthsSaved'>): string {
  const interest = Math.max(0, result.interestSavedCents);
  const months = Math.max(0, result.monthsSaved);
  if (result.baseline.monthsRemaining === null && result.scenario.monthsRemaining !== null) {
    return `Avec ce remboursement, le crédit pourrait être soldé en ${formatMonths(result.scenario.monthsRemaining)}, alors qu’aujourd’hui la dette ne diminue pas.`;
  }
  if (interest === 0 && months === 0) {
    return 'Ce remboursement ne changerait presque rien : essayez un montant plus élevé.';
  }
  if (months === 0) {
    return `Vous économiseriez ${formatCentsShort(interest)} d’intérêts.`;
  }
  if (interest === 0) {
    return `Vous gagneriez ${formatMonths(months)}.`;
  }
  return `Vous économiseriez ${formatCentsShort(interest)} d’intérêts et ${formatMonths(months)}.`;
}
