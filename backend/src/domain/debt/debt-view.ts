import { roundDiv } from '../shared/rounding';
import { Debt } from './debt';
import {
  Amortization,
  amortize,
  monthlyInterestCents,
  payoffDate,
} from './amortization';

/** Au-dessus de ce taux d'endettement (mensualités + assurances ÷ revenus), on alerte. Repère du cours, pas une règle de droit. */
export const DEBT_RATIO_THRESHOLD_PERCENT = 35;

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
}

/** Vue d'un crédit : amortissement simulé depuis le capital restant déclaré. */
export function buildDebtView(debt: Debt, today: Date): DebtView {
  const plan = amortize(
    debt.remainingCents,
    debt.annualRateHundredths,
    debt.monthlyPaymentCents,
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
  const baseline: ScenarioSummary = toScenario(
    amortize(
      debt.remainingCents,
      debt.annualRateHundredths,
      debt.monthlyPaymentCents,
    ),
    base.payoffDate,
  );
  const lump = Math.min(lumpSumCents, debt.remainingCents);
  const extra = Math.min(extraMonthlyCents, debt.remainingCents);
  const remaining = debt.remainingCents - lump;
  const plan = amortize(
    remaining,
    debt.annualRateHundredths,
    debt.monthlyPaymentCents + extra,
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
    note: WHAT_IF_NOTE,
  };
}

export interface DebtSummary {
  activeCount: number;
  totalRemainingCents: number;
  /** Mensualités + assurances des crédits actifs. */
  totalMonthlyCents: number;
  /** Taux d'endettement entier (arrondi au plus proche) ; null si les revenus sont inconnus ou nuls. */
  debtToIncomePercent: number | null;
}

/** Crédits actifs = non archivés et non soldés (capital restant > 0). */
export function isActiveDebt(view: DebtView): boolean {
  return !view.debt.archived && view.debt.remainingCents > 0;
}

export function summarizeDebts(
  views: DebtView[],
  monthlyIncomeCents: number | null,
): DebtSummary {
  const active = views.filter(isActiveDebt);
  const totalMonthlyCents = active.reduce(
    (sum, v) => sum + v.debt.monthlyPaymentCents + v.debt.insuranceMonthlyCents,
    0,
  );
  return {
    activeCount: active.length,
    totalRemainingCents: active.reduce(
      (sum, v) => sum + v.debt.remainingCents,
      0,
    ),
    totalMonthlyCents,
    debtToIncomePercent:
      monthlyIncomeCents !== null && monthlyIncomeCents > 0
        ? roundDiv(totalMonthlyCents * 100, monthlyIncomeCents)
        : null,
  };
}
