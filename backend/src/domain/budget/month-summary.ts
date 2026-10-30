import { BLOCS, Bloc } from '../shared/bloc';
import { SpacePlan } from '../space/space-plan';
import { Transaction } from '../transaction/transaction';

export interface BlocSummary {
  bloc: Bloc;
  plannedCents: number;
  actualCents: number;
  /** actualCents - plannedCents : positif = depassement (ou epargne en plus). */
  gapCents: number;
}

export interface MonthSummary {
  month: string;
  income: { plannedCents: number; actualCents: number; gapCents: number };
  blocs: BlocSummary[];
  plannedBalanceCents: number;
  actualBalanceCents: number;
  /** Epargne reelle / revenus reels ; null sans revenu. */
  savingsRate: number | null;
}

/** Compare le plan d'un espace aux operations d'un mois (cf. simulateur « 4 blocs » du cours). */
export function summarizeMonth(
  month: string,
  plan: SpacePlan,
  transactions: Transaction[],
): MonthSummary {
  let actualIncome = 0;
  const actualByBloc: Record<Bloc, number> = {
    FIXE: 0,
    COURANT: 0,
    PLAISIR: 0,
    EPARGNE: 0,
  };

  for (const transaction of transactions) {
    const cents = transaction.amount.toCents();
    if (transaction.kind === 'INCOME') {
      actualIncome += cents;
    } else if (transaction.bloc) {
      actualByBloc[transaction.bloc] += cents;
    }
  }

  const blocs: BlocSummary[] = BLOCS.map((bloc) => ({
    bloc,
    plannedCents: plan.plannedFor(bloc),
    actualCents: actualByBloc[bloc],
    gapCents: actualByBloc[bloc] - plan.plannedFor(bloc),
  }));

  const actualOut = BLOCS.reduce((sum, bloc) => sum + actualByBloc[bloc], 0);

  return {
    month,
    income: {
      plannedCents: plan.incomeCents,
      actualCents: actualIncome,
      gapCents: actualIncome - plan.incomeCents,
    },
    blocs,
    plannedBalanceCents: plan.plannedBalanceCents,
    actualBalanceCents: actualIncome - actualOut,
    savingsRate:
      actualIncome > 0
        ? Math.round((actualByBloc.EPARGNE / actualIncome) * 10000) / 10000
        : null,
  };
}
