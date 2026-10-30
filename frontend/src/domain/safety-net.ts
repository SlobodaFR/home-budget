import { centsToInputValue, parseAmountToCents } from './money';
import { isValidDateInput, todayInputValue } from './month';

export const MIN_TARGET_MONTHS = 1;
export const MAX_TARGET_MONTHS = 24;
export const DEFAULT_TARGET_MONTHS = 3;

export interface SafetyNet {
  savedCents: number;
  asOf: string;
  targetMonths: number;
}

export interface SafetyNetFormValues {
  saved: string;
  asOf: string;
  targetMonths: string;
}

export interface SafetyNetFormErrors {
  saved?: string;
  asOf?: string;
  targetMonths?: string;
}

export type SafetyNetFormResult = { ok: true; payload: SafetyNet } | { ok: false; errors: SafetyNetFormErrors };

export function safetyNetToForm(safetyNet: SafetyNet | null, now: Date = new Date()): SafetyNetFormValues {
  if (!safetyNet) {
    return { saved: '', asOf: todayInputValue(now), targetMonths: String(DEFAULT_TARGET_MONTHS) };
  }
  return {
    saved: centsToInputValue(safetyNet.savedCents),
    asOf: safetyNet.asOf.slice(0, 10),
    targetMonths: String(safetyNet.targetMonths),
  };
}

export function buildSafetyNetPayload(values: SafetyNetFormValues): SafetyNetFormResult {
  const errors: SafetyNetFormErrors = {};

  const savedCents = parseAmountToCents(values.saved);
  if (values.saved.trim() === '') {
    errors.saved = 'Saisissez le montant de votre épargne (0 si vous n’avez encore rien).';
  } else if (savedCents === null) {
    errors.saved = 'Montant invalide : utilisez des chiffres et au plus 2 décimales (ex. 5 500).';
  }

  if (!isValidDateInput(values.asOf)) {
    errors.asOf = 'Choisissez une date valide.';
  }

  const monthsText = values.targetMonths.trim();
  const targetMonths = /^\d{1,3}$/.test(monthsText) ? Number(monthsText) : Number.NaN;
  if (!(targetMonths >= MIN_TARGET_MONTHS && targetMonths <= MAX_TARGET_MONTHS)) {
    errors.targetMonths = `L’objectif doit être un nombre de mois entre ${MIN_TARGET_MONTHS} et ${MAX_TARGET_MONTHS}.`;
  }

  if (Object.keys(errors).length > 0 || savedCents === null) {
    return { ok: false, errors };
  }
  return { ok: true, payload: { savedCents, asOf: values.asOf, targetMonths } };
}

/** Avancement calculé par le serveur (épargne actuelle, dépenses de référence, mois couverts). */
export interface SafetyNetProgress {
  currentCents: number;
  monthlyBasisCents: number;
  coveredMonths: number | null;
}

export interface SafetyNetState {
  safetyNet: SafetyNet | null;
  /** `null` si rien n'est déclaré ou si le serveur ne l'envoie pas (ancienne version). */
  progress: SafetyNetProgress | null;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Lit la réponse sans jamais planter : un `progress` absent ou illisible donne simplement `null`. */
export function parseSafetyNetState(raw: unknown): SafetyNetState {
  const body = raw as { safetyNet?: SafetyNet | null; progress?: Partial<Record<keyof SafetyNetProgress, unknown>> | null } | null;
  const safetyNet = body?.safetyNet ?? null;
  const progress = body?.progress;
  if (!safetyNet || !progress || !isCount(progress.currentCents) || !isCount(progress.monthlyBasisCents)) {
    return { safetyNet, progress: null };
  }
  return {
    safetyNet,
    progress: {
      currentCents: progress.currentCents,
      monthlyBasisCents: progress.monthlyBasisCents,
      coveredMonths: isCount(progress.coveredMonths) ? progress.coveredMonths : null,
    },
  };
}

export interface SafetyNetCoverage {
  /** Montant à afficher : l'épargne actuelle si le serveur la donne, sinon le montant déclaré. */
  currentCents: number;
  /** Ce qui s'est ajouté depuis la date déclarée (versements dans le bloc Épargne). */
  addedCents: number;
  monthlyBasisCents: number | null;
  /** `null` si on ne sait pas exprimer l'épargne en mois. */
  coveredMonths: number | null;
  /** Part de l'objectif atteinte, entre 0 et 1. */
  ratio: number;
  reached: boolean;
}

export function safetyNetCoverage(safetyNet: SafetyNet, progress: SafetyNetProgress | null): SafetyNetCoverage {
  const currentCents = progress?.currentCents ?? safetyNet.savedCents;
  const addedCents = Math.max(currentCents - safetyNet.savedCents, 0);
  const coveredMonths = progress?.coveredMonths ?? null;
  if (coveredMonths === null) {
    return { currentCents, addedCents, monthlyBasisCents: progress?.monthlyBasisCents ?? null, coveredMonths: null, ratio: 0, reached: false };
  }
  const ratio = Math.min(Math.max(coveredMonths / safetyNet.targetMonths, 0), 1);
  return {
    currentCents,
    addedCents,
    monthlyBasisCents: progress?.monthlyBasisCents ?? null,
    coveredMonths,
    ratio,
    reached: coveredMonths >= safetyNet.targetMonths,
  };
}

const MONTHS_FORMATTER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

export function formatMonthsCount(months: number): string {
  return `${MONTHS_FORMATTER.format(months)} mois`;
}
