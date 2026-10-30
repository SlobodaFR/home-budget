import { toIsoDate } from '../shared/calendar';
import { roundDiv } from '../shared/rounding';
import { SpacePlan } from '../space/space-plan';
import { Transaction } from '../transaction/transaction';
import { SafetyNet } from './safety-net';

/** Nombre de mois réels (complets, avant le mois en cours) moyennés quand le plan ne dit rien. */
export const REFERENCE_AVERAGE_MONTHS = 3;

export interface SafetyNetProgress {
  /** Épargne disponible : montant déclaré + dépenses EPARGNE communes postérieures à `asOf`. */
  currentCents: number;
  /** Dépenses mensuelles essentielles de référence (0 si on ne sait rien). */
  monthlyBasisCents: number;
  /** Mois couverts, arrondis à 0,1 ; null si la base vaut 0. */
  coveredMonths: number | null;
}

/**
 * Épargne de sécurité disponible : le montant déclaré à `asOf` plus les
 * dépenses du bloc EPARGNE de l'espace commun datées APRÈS `asOf` (le jour
 * déclaré est supposé déjà compté dans le montant).
 */
export function currentSafetyNetCents(
  safetyNet: SafetyNet,
  commonTransactions: Transaction[],
): number {
  const added = commonTransactions
    .filter(
      (t) =>
        t.kind === 'EXPENSE' &&
        t.bloc === 'EPARGNE' &&
        toIsoDate(t.date) > safetyNet.asOf,
    )
    .reduce((sum, t) => sum + t.amount.toCents(), 0);
  return safetyNet.savedCents + added;
}

/** Dépenses essentielles (FIXE + COURANT) d'une liste d'opérations. */
export function essentialSpendCents(transactions: Transaction[]): number {
  return transactions
    .filter(
      (t) =>
        t.kind === 'EXPENSE' && (t.bloc === 'FIXE' || t.bloc === 'COURANT'),
    )
    .reduce((sum, t) => sum + t.amount.toCents(), 0);
}

/**
 * BASE UNIQUE de la couverture (endpoint `progress` ET conseil
 * `safety-net-progress`) : les dépenses ESSENTIELLES (blocs FIXE + COURANT, hors
 * plaisir et épargne : on les réduirait en cas de coup dur) du PLAN de l'espace
 * commun, plutôt que du réel d'un seul mois, trop variable. Sans plan, repli
 * sur la moyenne réelle des `REFERENCE_AVERAGE_MONTHS` derniers mois complets.
 * 0 si on ne sait rien.
 */
export function referenceMonthlySpendCents(
  plan: SpacePlan,
  recentEssentialTotalCents: number,
): number {
  const planned = plan.fixeCents + plan.courantCents;
  return planned > 0
    ? planned
    : roundDiv(recentEssentialTotalCents, REFERENCE_AVERAGE_MONTHS);
}

/** Mois de dépenses couverts, arrondis à 0,1 ; null sans base. */
export function coveredMonths(
  currentCents: number,
  monthlyBasisCents: number,
): number | null {
  if (monthlyBasisCents <= 0) {
    return null;
  }
  return roundDiv(currentCents * 10, monthlyBasisCents) / 10;
}

export function buildSafetyNetProgress(
  currentCents: number,
  monthlyBasisCents: number,
): SafetyNetProgress {
  return {
    currentCents,
    monthlyBasisCents,
    coveredMonths: coveredMonths(currentCents, monthlyBasisCents),
  };
}
