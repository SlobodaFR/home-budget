import { Bloc, BLOCS } from './bloc';
import { TransactionKind } from './budget';
import { formatCents } from './money';

export type OccurrenceStatus = 'PAID' | 'MISSING' | 'DUE';

export interface ForecastFigure {
  plannedCents: number;
  actualCents: number;
  expectedRemainingCents: number;
  projectedCents: number;
}

export interface ForecastIncome extends ForecastFigure {
  /** Espace commun : les contributions de chacun sont supposées versées. */
  contributionAssumed?: boolean;
}

export interface ForecastBloc extends ForecastFigure {
  bloc: Bloc;
}

export interface ForecastOccurrence {
  recurringId: string;
  label: string;
  kind: TransactionKind;
  bloc: Bloc | null;
  amountCents: number;
  date: string;
  estimated: boolean;
  status: OccurrenceStatus;
}

export interface Forecast {
  month: string;
  asOf: string;
  income: ForecastIncome;
  blocs: ForecastBloc[];
  projectedBalanceCents: number;
  cautiousBalanceCents: number;
  occurrences: ForecastOccurrence[];
}

export const OCCURRENCE_STATUS_INFO: Record<OccurrenceStatus, { label: string; description: string }> = {
  PAID: { label: 'Retrouvé', description: 'déjà dans vos opérations' },
  MISSING: { label: 'Non retrouvé', description: 'attendu mais non retrouvé' },
  DUE: { label: 'À venir', description: 'pas encore arrivé à échéance' },
};

export function balanceGapCents(forecast: Pick<Forecast, 'projectedBalanceCents' | 'cautiousBalanceCents'>): number {
  return Math.max(forecast.projectedBalanceCents - forecast.cautiousBalanceCents, 0);
}

export function describeBalanceGap(forecast: Pick<Forecast, 'projectedBalanceCents' | 'cautiousBalanceCents'>): string {
  const gap = balanceGapCents(forecast);
  if (gap === 0) {
    return 'Les deux soldes sont identiques : il n’y a rien de plus à prévoir que ce qui est déjà connu.';
  }
  return `Le solde prudent est ${formatCents(gap)} plus bas : il suppose que vous dépensez au moins le prévu dans chaque bloc.`;
}

export function missingOccurrences(forecast: Pick<Forecast, 'occurrences'>): ForecastOccurrence[] {
  return forecast.occurrences.filter((occurrence) => occurrence.status === 'MISSING');
}

export function countByStatus(occurrences: readonly ForecastOccurrence[]): Record<OccurrenceStatus, number> {
  const counts: Record<OccurrenceStatus, number> = { PAID: 0, MISSING: 0, DUE: 0 };
  for (const occurrence of occurrences) {
    counts[occurrence.status] += 1;
  }
  return counts;
}

export function missingBanner(count: number): string {
  return count > 1
    ? `${count} paiements sont attendus mais non retrouvés`
    : '1 paiement est attendu mais non retrouvé';
}

export type ProjectionStatus = 'over' | 'behind' | 'ok';

export interface ProjectionNote {
  status: ProjectionStatus;
  amountCents: number;
}

/**
 * Compare le projeté au prévu : une dépense qui dépasserait son bloc, ou une épargne en retard sur son objectif.
 * Sans prévu pour le bloc, rien à comparer.
 */
export function projectionNote(bloc: Bloc, figure: ForecastFigure): ProjectionNote {
  if (figure.plannedCents <= 0) {
    return { status: 'ok', amountCents: 0 };
  }
  const delta = figure.projectedCents - figure.plannedCents;
  if (bloc === 'EPARGNE') {
    return delta < 0 ? { status: 'behind', amountCents: -delta } : { status: 'ok', amountCents: 0 };
  }
  return delta > 0 ? { status: 'over', amountCents: delta } : { status: 'ok', amountCents: 0 };
}

/** Garantit les 4 blocs dans l'ordre du cours, même si le serveur en oublie un. */
export function orderedBlocs(blocs: readonly ForecastBloc[]): ForecastBloc[] {
  return BLOCS.map(
    (bloc) =>
      blocs.find((figure) => figure.bloc === bloc) ?? {
        bloc,
        plannedCents: 0,
        actualCents: 0,
        expectedRemainingCents: 0,
        projectedCents: 0,
      },
  );
}
