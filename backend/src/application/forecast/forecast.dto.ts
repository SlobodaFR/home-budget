import { Forecast, OccurrenceStatus } from '../../domain/budget/forecast';
import { Bloc } from '../../domain/shared/bloc';
import { TransactionKind } from '../../domain/transaction/transaction';

export interface ForecastLineDto {
  plannedCents: number;
  actualCents: number;
  expectedRemainingCents: number;
  projectedCents: number;
}

export interface ForecastDto {
  month: string;
  asOf: string;
  income: ForecastLineDto;
  blocs: (ForecastLineDto & { bloc: Bloc })[];
  projectedBalanceCents: number;
  cautiousBalanceCents: number;
  occurrences: {
    recurringId: string;
    label: string;
    kind: TransactionKind;
    bloc: Bloc | null;
    amountCents: number;
    date: string;
    estimated: boolean;
    status: OccurrenceStatus;
  }[];
}

export function toForecastDto(forecast: Forecast): ForecastDto {
  return {
    month: forecast.month,
    asOf: forecast.asOf.toISOString(),
    income: forecast.income,
    blocs: forecast.blocs,
    projectedBalanceCents: forecast.projectedBalanceCents,
    cautiousBalanceCents: forecast.cautiousBalanceCents,
    occurrences: forecast.occurrences.map((o) => ({
      recurringId: o.recurringId,
      label: o.label,
      kind: o.kind,
      bloc: o.bloc,
      amountCents: o.amountCents,
      date: o.date.toISOString(),
      estimated: o.estimated,
      status: o.status,
    })),
  };
}
