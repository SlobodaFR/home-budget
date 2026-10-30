import { roundDiv } from '../shared/rounding';
import { AidRuleId, getAidRule, AID_RULES } from './aid-rules';
import { FiscalProfile } from './fiscal-profile';

const GARDE_CAP_PER_CHILD_CENTS = 350_000;
const SERVICES_BASE_CAP_CENTS = 1_200_000;
const SERVICES_PER_CHILD_CAP_CENTS = 150_000;
const SERVICES_MAX_CAP_CENTS = 1_500_000;
/** Première année d'emploi à domicile : base relevée de 3 000 € et plafond global de 18 000 €. */
const SERVICES_FIRST_YEAR_BASE_CAP_CENTS = 1_500_000;
const SERVICES_FIRST_YEAR_MAX_CAP_CENTS = 1_800_000;

/**
 * Plafond de DÉPENSES retenues (pas du crédit) d'une règle pour un foyer fiscal.
 * Non géré : invalidité (20 000 €), personnes de plus de 65 ans, résidence
 * alternée (majoration à 750 €) et sous-plafonds (jardinage, informatique, bricolage).
 */
export function aidCapCents(ruleId: AidRuleId, profile: FiscalProfile): number {
  switch (ruleId) {
    case 'CREDIT_IMPOT_GARDE_HORS_DOMICILE':
      return GARDE_CAP_PER_CHILD_CENTS * profile.childrenUnderSix;
    case 'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE': {
      const perChildren =
        SERVICES_PER_CHILD_CAP_CENTS * profile.dependentChildren;
      return profile.firstYearHomeServices
        ? Math.min(
            SERVICES_FIRST_YEAR_BASE_CAP_CENTS + perChildren,
            SERVICES_FIRST_YEAR_MAX_CAP_CENTS,
          )
        : Math.min(
            SERVICES_BASE_CAP_CENTS + perChildren,
            SERVICES_MAX_CAP_CENTS,
          );
    }
  }
}

export interface AidLineInput {
  recurringId: string;
  label: string;
  /** Montant du gabarit récurrent (par mois). */
  monthlyCents: number;
  /** Somme des occurrences actives de l'année (réel retrouvé, sinon gabarit). */
  yearlySpentCents: number;
}

export interface AidLineResult extends AidLineInput {
  /** Coût mensuel après crédit d'impôt. */
  netMonthlyCents: number;
}

export interface AidRuleResult {
  ruleId: AidRuleId;
  label: string;
  ratePercent: number;
  spentCents: number;
  capCents: number;
  eligibleCents: number;
  expectedCreditCents: number;
  capReached: boolean;
  cashTiming: string;
  sourceUrl: string;
  verifiedOn: string;
  lines: AidLineResult[];
}

/**
 * Calcule le crédit attendu d'une règle pour l'ensemble de ses lignes : le
 * plafond est partagé par toutes les lignes (foyer fiscal). Quand il est
 * atteint, la part du crédit de chaque ligne est répartie au prorata de sa
 * dépense annuelle.
 */
export function computeAidRule(
  ruleId: AidRuleId,
  lines: AidLineInput[],
  profile: FiscalProfile,
): AidRuleResult {
  const rule = getAidRule(ruleId);
  const spentCents = lines.reduce(
    (sum, line) => sum + line.yearlySpentCents,
    0,
  );
  const capCents = aidCapCents(ruleId, profile);
  const eligibleCents = Math.min(spentCents, capCents);
  const expectedCreditCents = roundDiv(eligibleCents * rule.ratePercent, 100);
  const capReached = spentCents > capCents;

  return {
    ruleId,
    label: rule.label,
    ratePercent: rule.ratePercent,
    spentCents,
    capCents,
    eligibleCents,
    expectedCreditCents,
    capReached,
    cashTiming: rule.cashTiming,
    sourceUrl: rule.sourceUrl,
    verifiedOn: rule.verifiedOn,
    lines: lines.map((line) => ({
      ...line,
      netMonthlyCents: capReached
        ? line.monthlyCents -
          roundDiv(line.monthlyCents * expectedCreditCents, spentCents)
        : roundDiv(line.monthlyCents * (100 - rule.ratePercent), 100),
    })),
  };
}

/** Ordre du catalogue, pour présenter les règles de façon stable. */
export function aidRuleOrder(ruleId: AidRuleId): number {
  return AID_RULES.findIndex((rule) => rule.id === ruleId);
}
