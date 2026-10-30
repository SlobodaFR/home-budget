import { Forecast } from '../budget/forecast';
import { MonthSummary } from '../budget/month-summary';
import { normalizeText } from '../import/classification';
import { Bloc } from '../shared/bloc';
import { roundDivSigned } from '../shared/rounding';
import { Transaction } from '../transaction/transaction';

export const MAX_TOP_EXPENSES = 5;

export interface ReviewSnapshot {
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  /** Solde ÷ revenus, arrondi à l'entier (0 sans revenu ; négatif possible). */
  savingsRatePercent: number;
  blocs: {
    bloc: Bloc;
    plannedCents: number;
    actualCents: number;
    /** Réel − prévu. */
    deltaCents: number;
  }[];
  topExpenses: { label: string; amountCents: number; count: number }[];
  missingRecurring: { label: string; amountCents: number }[];
  unassignedTransactionCount: number;
}

export interface ReviewSnapshotInput {
  summary: MonthSummary;
  forecast: Forecast;
  /** Opérations du mois. */
  transactions: Transaction[];
  /** Nombre de comptes de l'espace : sans compte, rien n'est « à rattacher ». */
  accountCount: number;
}

/**
 * Photographie du mois, recalculée à chaque lecture (jamais stockée) à partir de
 * fonctions existantes : résumé du mois (revenus, blocs réels et prévus),
 * prévisionnel (paiements récurrents MISSING) et opérations. Tout en entiers.
 */
export function buildReviewSnapshot(
  input: ReviewSnapshotInput,
): ReviewSnapshot {
  const { summary, forecast, transactions } = input;
  const incomeCents = summary.income.actualCents;
  const expenseCents = summary.blocs.reduce((sum, b) => sum + b.actualCents, 0);
  const balanceCents = summary.actualBalanceCents;

  // Regroupement des libellés sans casse ni accents ; le libellé affiché est celui
  // de la plus grosse opération du groupe (à égalité, la plus ancienne).
  const groups = new Map<
    string,
    { best: Transaction; amountCents: number; count: number }
  >();
  for (const t of transactions) {
    if (t.kind !== 'EXPENSE') {
      continue;
    }
    const key = normalizeText(t.label);
    const group = groups.get(key);
    if (!group) {
      groups.set(key, {
        best: t,
        amountCents: t.amount.toCents(),
        count: 1,
      });
      continue;
    }
    group.amountCents += t.amount.toCents();
    group.count += 1;
    const larger = t.amount.toCents() - group.best.amount.toCents();
    if (
      larger > 0 ||
      (larger === 0 && t.date.getTime() < group.best.date.getTime())
    ) {
      group.best = t;
    }
  }

  return {
    incomeCents,
    expenseCents,
    balanceCents,
    savingsRatePercent:
      incomeCents > 0 ? roundDivSigned(balanceCents * 100, incomeCents) : 0,
    blocs: summary.blocs.map((b) => ({
      bloc: b.bloc,
      plannedCents: b.plannedCents,
      actualCents: b.actualCents,
      deltaCents: b.gapCents,
    })),
    topExpenses: [...groups.values()]
      .map((g) => ({
        label: g.best.label,
        amountCents: g.amountCents,
        count: g.count,
      }))
      .sort(
        (a, b) =>
          b.amountCents - a.amountCents || a.label.localeCompare(b.label, 'fr'),
      )
      .slice(0, MAX_TOP_EXPENSES),
    missingRecurring: forecast.occurrences
      .filter((o) => o.status === 'MISSING')
      .map((o) => ({ label: o.label, amountCents: o.amountCents })),
    unassignedTransactionCount:
      input.accountCount > 0
        ? transactions.filter((t) => t.accountId === null).length
        : 0,
  };
}
