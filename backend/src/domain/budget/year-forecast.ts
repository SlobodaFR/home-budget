import { RecurringItem } from '../recurring/recurring-item';
import { SpacePlan } from '../space/space-plan';
import { TransactionKind } from '../transaction/transaction';
import { expandOccurrences } from './forecast';
import { buildProvisions } from './provisions';

/** Un mois est un pic si ses dépenses dépassent la moyenne mensuelle de l'année de plus de 30 %. */
export const PEAK_RATIO_PERCENT = 130;

export interface YearForecastItem {
  recurringId: string;
  label: string;
  kind: TransactionKind;
  amountCents: number;
}

export interface YearForecastMonth {
  month: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  cumulativeCents: number;
  peak: boolean;
  items: YearForecastItem[];
}

export interface YearForecast {
  year: number;
  months: YearForecastMonth[];
  totalIncomeCents: number;
  totalExpenseCents: number;
  provisionHintCents: number;
}

export interface YearForecastInput {
  year: number;
  recurring: RecurringItem[];
  plan: SpacePlan;
  /** Espace commun : revenus complétés par les contributions supposées. */
  commonSpace: boolean;
  /** Jour de référence des provisions (`provisionHintCents`). */
  today: Date;
}

/**
 * Les 12 mois d'une année vus à travers les seuls paiements récurrents (pas les
 * opérations) pour repérer les pics. Même moteur d'occurrences que le prévisionnel.
 * Espace commun sans revenu au plan : les revenus de chaque mois sont complétés
 * jusqu'à la somme des blocs du plan (contributions supposées).
 */
export function buildYearForecast(input: YearForecastInput): YearForecast {
  const { year, recurring, plan } = input;
  const assumed = input.commonSpace && plan.incomeCents === 0;

  const months: YearForecastMonth[] = [];
  let cumulative = 0;
  for (let index = 0; index < 12; index++) {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`;
    const occurrences = expandOccurrences(recurring, month);
    const recurringIncome = occurrences
      .filter((o) => o.kind === 'INCOME')
      .reduce((sum, o) => sum + o.amountCents, 0);
    const expenseCents = occurrences
      .filter((o) => o.kind === 'EXPENSE')
      .reduce((sum, o) => sum + o.amountCents, 0);
    const incomeCents = assumed
      ? Math.max(recurringIncome, plan.totalBlocsCents)
      : recurringIncome;
    const balanceCents = incomeCents - expenseCents;
    cumulative += balanceCents;
    months.push({
      month,
      incomeCents,
      expenseCents,
      balanceCents,
      cumulativeCents: cumulative,
      peak: false,
      items: occurrences.map((o) => ({
        recurringId: o.recurringId,
        label: o.label,
        kind: o.kind,
        amountCents: o.amountCents,
      })),
    });
  }

  const totalExpenseCents = months.reduce((s, m) => s + m.expenseCents, 0);
  // expense > moyenne × 1,3  <=>  expense × 12 × 100 > total × 130 (entiers, sans flottant).
  for (const m of months) {
    m.peak =
      totalExpenseCents > 0 &&
      m.expenseCents * 12 * 100 > totalExpenseCents * PEAK_RATIO_PERCENT;
  }

  return {
    year,
    months,
    totalIncomeCents: months.reduce((s, m) => s + m.incomeCents, 0),
    totalExpenseCents,
    provisionHintCents: buildProvisions(recurring, input.today)
      .totalMonthlyProvisionCents,
  };
}
