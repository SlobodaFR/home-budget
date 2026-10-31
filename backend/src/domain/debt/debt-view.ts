import { roundDiv, roundDivSigned } from '../shared/rounding';
import { Debt } from './debt';
import {
  Amortization,
  PAYMENT_GAP_TOLERANCE_PERCENT,
  amortize,
  expectedMonthlyPaymentCents,
  insuranceTermsOf,
  monthlyInsuranceCents,
  monthlyInterestCents,
  payoffDate,
} from './amortization';

/** Au-dessus de ce taux d'endettement (mensualités + assurances ÷ revenus), on alerte. Repère du cours, pas une règle de droit. */
export const DEBT_RATIO_THRESHOLD_PERCENT = 35;

/**
 * Cohérence entre la mensualité saisie et le prêt d'origine. `UNKNOWN` : taux variable
 * ou révisable, durée initiale inconnue. Les montants saisis ne sont jamais modifiés.
 */
export type PaymentCheck =
  | { status: 'UNKNOWN' }
  | {
      status: 'OK' | 'GAP';
      expectedMonthlyPaymentCents: number;
      /** Saisie − attendue. */
      differenceCents: number;
      /** Écart signé en pourcent de l'attendue, arrondi au plus proche. */
      differencePercent: number;
    };

/**
 * Mensualité attendue pour amortir le capital emprunté au taux saisi sur la durée
 * initiale (dichotomie sur la simulation entière), comparée à la mensualité saisie
 * (hors assurance). OK si l'écart ne dépasse pas 2 % de l'attendue.
 */
export function checkPayment(debt: Debt): PaymentCheck {
  if (
    (debt.rateType !== null && debt.rateType !== 'FIXED') ||
    debt.initialTermMonths === null
  ) {
    return { status: 'UNKNOWN' };
  }
  const expected = expectedMonthlyPaymentCents(
    debt.principalCents,
    debt.annualRateHundredths,
    debt.initialTermMonths,
  );
  const difference = debt.monthlyPaymentCents - expected;
  return {
    status:
      Math.abs(difference) * 100 <= PAYMENT_GAP_TOLERANCE_PERCENT * expected
        ? 'OK'
        : 'GAP',
    expectedMonthlyPaymentCents: expected,
    differenceCents: difference,
    differencePercent: roundDivSigned(difference * 100, expected),
  };
}

export interface DebtView {
  debt: Debt;
  monthsRemaining: number | null;
  payoffDate: string | null;
  totalInterestRemainingCents: number | null;
  /** (emprunté − restant) ÷ emprunté, arrondi inférieur, 0-100. */
  paidSharePercent: number;
  neverPaidOff: boolean;
  /** Intérêt du prochain mois, pour expliquer un crédit qui ne diminue pas. */
  nextMonthInterestCents: number;
  /** Assurance du mois courant (selon le mode de calcul). */
  monthlyInsuranceCents: number;
  /** Mensualité + assurance du mois courant. */
  monthlyTotalCents: number;
  /** Assurance cumulée des mensualités restantes ; null si jamais remboursé. */
  remainingInsuranceCents: number | null;
  /** Intérêts restants + assurance restante ; null si jamais remboursé. */
  remainingCostCents: number | null;
  paymentCheck: PaymentCheck;
}

/** Vue d'un crédit : amortissement simulé depuis le capital restant déclaré. */
export function buildDebtView(debt: Debt, today: Date): DebtView {
  const insurance = insuranceTermsOf(debt);
  const plan = amortize(
    debt.remainingCents,
    debt.annualRateHundredths,
    debt.monthlyPaymentCents,
    insurance,
  );
  const monthlyInsurance = monthlyInsuranceCents(
    insurance,
    debt.remainingCents,
  );
  return {
    debt,
    monthsRemaining: plan.months,
    payoffDate: plan.paidOff
      ? payoffDate(today, debt.paymentDay, plan.months ?? 0)
      : null,
    totalInterestRemainingCents: plan.totalInterestCents,
    paidSharePercent: Math.floor(
      ((debt.principalCents - debt.remainingCents) * 100) / debt.principalCents,
    ),
    neverPaidOff: !plan.paidOff,
    nextMonthInterestCents: monthlyInterestCents(
      debt.remainingCents,
      debt.annualRateHundredths,
    ),
    monthlyInsuranceCents: monthlyInsurance,
    monthlyTotalCents: debt.monthlyPaymentCents + monthlyInsurance,
    remainingInsuranceCents: plan.totalInsuranceCents,
    remainingCostCents: plan.paidOff
      ? plan.totalInterestCents! + plan.totalInsuranceCents!
      : null,
    paymentCheck: checkPayment(debt),
  };
}

/** Actives d'abord (non archivées), puis par nom. */
export function buildDebtViews(debts: Debt[], today: Date): DebtView[] {
  return debts
    .map((d) => buildDebtView(d, today))
    .sort(
      (a, b) =>
        Number(a.debt.archived) - Number(b.debt.archived) ||
        a.debt.name.localeCompare(b.debt.name, 'fr') ||
        a.debt.id.localeCompare(b.debt.id),
    );
}

export interface ScenarioSummary {
  monthsRemaining: number | null;
  totalInterestRemainingCents: number | null;
  payoffDate: string | null;
  neverPaidOff?: true;
}

function toScenario(
  plan: Amortization,
  debtPayoff: string | null,
): ScenarioSummary {
  return plan.paidOff
    ? {
        monthsRemaining: plan.months,
        totalInterestRemainingCents: plan.totalInterestCents,
        payoffDate: debtPayoff,
      }
    : {
        monthsRemaining: null,
        totalInterestRemainingCents: null,
        payoffDate: null,
        neverPaidOff: true,
      };
}

export interface WhatIf {
  baseline: ScenarioSummary;
  scenario: ScenarioSummary;
  /** null si l'un des deux scénarios n'a pas de fin (rien à comparer) ; jamais négatif. */
  interestSavedCents: number | null;
  monthsSaved: number | null;
  /** Assurance économisée par le scénario ; null si l'un des deux scénarios n'a pas de fin ; jamais négative. */
  insuranceSavedCents: number | null;
  note: string;
}

export const WHAT_IF_NOTE =
  'Vérifiez les indemnités de remboursement anticipé de votre contrat.';

/**
 * Simule un versement mensuel supplémentaire et/ou un remboursement partiel
 * immédiat (tous deux plafonnés au capital restant) face à la trajectoire
 * actuelle. Les économies ne sont jamais négatives.
 */
export function whatIf(
  debt: Debt,
  extraMonthlyCents: number,
  lumpSumCents: number,
  today: Date,
): WhatIf {
  const base = buildDebtView(debt, today);
  const insurance = insuranceTermsOf(debt);
  const basePlan = amortize(
    debt.remainingCents,
    debt.annualRateHundredths,
    debt.monthlyPaymentCents,
    insurance,
  );
  const baseline: ScenarioSummary = toScenario(basePlan, base.payoffDate);
  const lump = Math.min(lumpSumCents, debt.remainingCents);
  const extra = Math.min(extraMonthlyCents, debt.remainingCents);
  const remaining = debt.remainingCents - lump;
  const plan = amortize(
    remaining,
    debt.annualRateHundredths,
    debt.monthlyPaymentCents + extra,
    insurance,
  );
  const scenario = toScenario(
    plan,
    plan.paidOff ? payoffDate(today, debt.paymentDay, plan.months ?? 0) : null,
  );
  const comparable =
    baseline.monthsRemaining !== null && scenario.monthsRemaining !== null;
  return {
    baseline,
    scenario,
    interestSavedCents: comparable
      ? Math.max(
          0,
          baseline.totalInterestRemainingCents! -
            scenario.totalInterestRemainingCents!,
        )
      : null,
    monthsSaved: comparable
      ? Math.max(0, baseline.monthsRemaining! - scenario.monthsRemaining!)
      : null,
    insuranceSavedCents: comparable
      ? Math.max(0, basePlan.totalInsuranceCents! - plan.totalInsuranceCents!)
      : null,
    note: WHAT_IF_NOTE,
  };
}

export interface LenderSummary {
  /** Libellé du premier crédit rencontré pour ce prêteur ('' si non renseigné). */
  lender: string;
  activeCount: number;
  remainingCents: number;
  monthlyTotalCents: number;
}

export interface DebtSummary {
  activeCount: number;
  totalRemainingCents: number;
  /** Mensualités + assurances (calculées) des crédits actifs. */
  totalMonthlyCents: number;
  /** Assurances mensuelles des crédits actifs. */
  totalMonthlyInsuranceCents: number;
  /** Somme des coûts restants (intérêts + assurance) des crédits actifs qui finissent. */
  totalRemainingCostCents: number;
  /** Crédits actifs regroupés par prêteur, capital restant décroissant. */
  byLender: LenderSummary[];
  /** Taux d'endettement entier (arrondi au plus proche) ; null si les revenus sont inconnus ou nuls. */
  debtToIncomePercent: number | null;
}

/** Crédits actifs = non archivés et non soldés (capital restant > 0). */
export function isActiveDebt(view: DebtView): boolean {
  return !view.debt.archived && view.debt.remainingCents > 0;
}

/** Clé de regroupement : sans casse ni espaces superflus. */
function lenderKey(lender: string): string {
  return lender.trim().replace(/\s+/g, ' ').toLowerCase();
}

function groupByLender(active: DebtView[]): LenderSummary[] {
  const groups = new Map<string, LenderSummary>();
  for (const view of active) {
    const key = lenderKey(view.debt.lender);
    const group = groups.get(key) ?? {
      lender: key === '' ? '' : view.debt.lender,
      activeCount: 0,
      remainingCents: 0,
      monthlyTotalCents: 0,
    };
    group.activeCount += 1;
    group.remainingCents += view.debt.remainingCents;
    group.monthlyTotalCents += view.monthlyTotalCents;
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) =>
      b.remainingCents - a.remainingCents ||
      a.lender.localeCompare(b.lender, 'fr'),
  );
}

export function summarizeDebts(
  views: DebtView[],
  monthlyIncomeCents: number | null,
): DebtSummary {
  const active = views.filter(isActiveDebt);
  const totalMonthlyCents = active.reduce(
    (sum, v) => sum + v.monthlyTotalCents,
    0,
  );
  return {
    activeCount: active.length,
    totalRemainingCents: active.reduce(
      (sum, v) => sum + v.debt.remainingCents,
      0,
    ),
    totalMonthlyCents,
    totalMonthlyInsuranceCents: active.reduce(
      (sum, v) => sum + v.monthlyInsuranceCents,
      0,
    ),
    totalRemainingCostCents: active.reduce(
      (sum, v) => sum + (v.remainingCostCents ?? 0),
      0,
    ),
    byLender: groupByLender(active),
    debtToIncomePercent:
      monthlyIncomeCents !== null && monthlyIncomeCents > 0
        ? roundDiv(totalMonthlyCents * 100, monthlyIncomeCents)
        : null,
  };
}
