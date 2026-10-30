import { BLOCS, Bloc } from '../shared/bloc';
import { daysInMonth, startOfUtcDay, toIsoDate } from '../shared/calendar';
import { normalizeText } from '../import/classification';
import { RecurringItem } from '../recurring/recurring-item';
import { SpacePlan } from '../space/space-plan';
import { Transaction, TransactionKind } from '../transaction/transaction';
import { parseMonth } from './month';

export type OccurrenceStatus = 'PAID' | 'MISSING' | 'DUE';

export interface Occurrence {
  recurringId: string;
  label: string;
  kind: TransactionKind;
  bloc: Bloc | null;
  amountCents: number;
  /** Minuit UTC du jour attendu. */
  date: Date;
  /** Vrai si le jour du gabarit est inconnu (fin de mois par défaut). */
  estimated: boolean;
  status: OccurrenceStatus;
  /** Opération qui couvre l'occurrence (null si aucune) : sert aux aides, pas à l'API. */
  matchedTransactionId: string | null;
  matchedAmountCents: number | null;
}

export type MonthPhase = 'PAST' | 'CURRENT' | 'FUTURE';

/** Le mois est-il entièrement passé, en cours ou à venir par rapport à `today` ? */
export function monthPhase(month: string, today: Date): MonthPhase {
  const { from, to } = parseMonth(month);
  const todayStart = startOfUtcDay(today);
  if (todayStart.getTime() >= to.getTime()) {
    return 'PAST';
  }
  return todayStart.getTime() < from.getTime() ? 'FUTURE' : 'CURRENT';
}

/**
 * Occurrences d'un mois pour les gabarits actifs. Une occurrence existe si sa
 * date tombe entre `startDate` et `endDate` (inclus). Un jour absent donne une
 * occurrence estimée au dernier jour du mois ; un jour supérieur à la longueur
 * du mois retombe sur le dernier jour. Le statut est ensuite posé par
 * `matchOccurrences`.
 */
export function expandOccurrences(
  items: RecurringItem[],
  month: string,
): Occurrence[] {
  const { from } = parseMonth(month);
  const year = from.getUTCFullYear();
  const monthIndex = from.getUTCMonth();
  const lastDay = daysInMonth(year, monthIndex);

  const occurrences: Occurrence[] = [];
  for (const item of items) {
    if (!item.active) {
      continue;
    }
    const estimated = item.dayOfMonth === null;
    const day = Math.min(item.dayOfMonth ?? lastDay, lastDay);
    const date = new Date(Date.UTC(year, monthIndex, day));
    const iso = toIsoDate(date);
    if (iso < item.startDate || (item.endDate !== null && iso > item.endDate)) {
      continue;
    }
    occurrences.push({
      recurringId: item.id,
      label: item.label,
      kind: item.kind,
      bloc: item.bloc,
      amountCents: item.amount.toCents(),
      date,
      estimated,
      status: 'DUE',
      matchedTransactionId: null,
      matchedAmountCents: null,
    });
  }
  return occurrences.sort(compareOccurrences);
}

function compareOccurrences(a: Occurrence, b: Occurrence): number {
  return (
    a.date.getTime() - b.date.getTime() ||
    a.label.localeCompare(b.label) ||
    a.recurringId.localeCompare(b.recurringId)
  );
}

/** Libellés voisins : l'un contient l'autre, sans casse ni accents. */
export function labelsAreNeighbours(a: string, b: string): boolean {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) {
    return false;
  }
  return left.includes(right) || right.includes(left);
}

/**
 * Apparie les occurrences aux opérations du mois (même type, même bloc, libellé
 * voisin) et pose le statut : PAID si retrouvée, sinon MISSING si sa date est
 * passée, DUE si elle est aujourd'hui ou à venir. Chaque opération ne couvre
 * qu'une occurrence ; l'égalité stricte de libellé l'emporte sur le simple voisinage,
 * puis le jour le plus proche (déterministe).
 */
export function matchOccurrences(
  occurrences: Occurrence[],
  transactions: Transaction[],
  today: Date,
): Occurrence[] {
  const todayStart = startOfUtcDay(today).getTime();
  const result = occurrences.map((occurrence) => ({
    ...occurrence,
    matchedTransactionId: null as string | null,
    matchedAmountCents: null as number | null,
  }));
  const used = new Set<string>();
  const candidates = [...transactions].sort(
    (a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id),
  );

  const passes: ((occurrenceLabel: string, txLabel: string) => boolean)[] = [
    (a, b) => normalizeText(a) !== '' && normalizeText(a) === normalizeText(b),
    labelsAreNeighbours,
  ];

  for (const matches of passes) {
    // Toutes les paires possibles, de la plus proche (en jours) à la plus lointaine :
    // une occurrence ne vole pas l'opération d'une occurrence plus proche.
    const pairs: { occurrence: number; tx: Transaction; distance: number }[] =
      [];
    result.forEach((occurrence, index) => {
      if (occurrence.matchedTransactionId !== null) {
        return;
      }
      for (const tx of candidates) {
        if (
          used.has(tx.id) ||
          tx.kind !== occurrence.kind ||
          tx.bloc !== occurrence.bloc ||
          !matches(occurrence.label, tx.label)
        ) {
          continue;
        }
        pairs.push({
          occurrence: index,
          tx,
          distance: Math.abs(
            startOfUtcDay(tx.date).getTime() - occurrence.date.getTime(),
          ),
        });
      }
    });
    // Tri stable : à distance égale, l'ordre des occurrences puis des opérations décide.
    pairs.sort((a, b) => a.distance - b.distance);
    for (const pair of pairs) {
      const occurrence = result[pair.occurrence];
      if (occurrence.matchedTransactionId !== null || used.has(pair.tx.id)) {
        continue;
      }
      used.add(pair.tx.id);
      occurrence.matchedTransactionId = pair.tx.id;
      occurrence.matchedAmountCents = pair.tx.amount.toCents();
    }
  }

  for (const occurrence of result) {
    occurrence.status =
      occurrence.matchedTransactionId !== null
        ? 'PAID'
        : occurrence.date.getTime() < todayStart
          ? 'MISSING'
          : 'DUE';
  }
  return result;
}

export interface ForecastLine {
  plannedCents: number;
  actualCents: number;
  /** Occurrences pas encore retrouvées (MISSING et DUE) ; 0 pour un mois passé. */
  expectedRemainingCents: number;
  projectedCents: number;
}

export interface Forecast {
  month: string;
  /** Minuit UTC d'aujourd'hui. */
  asOf: Date;
  income: ForecastLine;
  blocs: (ForecastLine & { bloc: Bloc })[];
  projectedBalanceCents: number;
  cautiousBalanceCents: number;
  occurrences: Occurrence[];
}

export interface ForecastInput {
  month: string;
  today: Date;
  plan: SpacePlan;
  /** Opérations du mois. */
  transactions: Transaction[];
  recurring: RecurringItem[];
}

/**
 * Projette la fin du mois : opérations réelles + occurrences récurrentes pas
 * encore retrouvées. Un mois entièrement passé est égal au réel. Le solde
 * prudent compte au moins le prévu de chaque bloc (max(projeté, prévu)).
 */
export function buildForecast(input: ForecastInput): Forecast {
  const { month, today, plan, transactions } = input;
  const phase = monthPhase(month, today);
  const occurrences = matchOccurrences(
    expandOccurrences(input.recurring, month),
    transactions,
    today,
  );

  let actualIncome = 0;
  const actualByBloc: Record<Bloc, number> = {
    FIXE: 0,
    COURANT: 0,
    PLAISIR: 0,
    EPARGNE: 0,
  };
  for (const transaction of transactions) {
    if (transaction.kind === 'INCOME') {
      actualIncome += transaction.amount.toCents();
    } else if (transaction.bloc) {
      actualByBloc[transaction.bloc] += transaction.amount.toCents();
    }
  }

  let remainingIncome = 0;
  const remainingByBloc: Record<Bloc, number> = {
    FIXE: 0,
    COURANT: 0,
    PLAISIR: 0,
    EPARGNE: 0,
  };
  if (phase !== 'PAST') {
    for (const occurrence of occurrences) {
      if (occurrence.status === 'PAID') {
        continue;
      }
      if (occurrence.kind === 'INCOME') {
        remainingIncome += occurrence.amountCents;
      } else if (occurrence.bloc) {
        remainingByBloc[occurrence.bloc] += occurrence.amountCents;
      }
    }
  }

  const income: ForecastLine = {
    plannedCents: plan.incomeCents,
    actualCents: actualIncome,
    expectedRemainingCents: remainingIncome,
    projectedCents: actualIncome + remainingIncome,
  };
  const blocs = BLOCS.map((bloc) => ({
    bloc,
    plannedCents: plan.plannedFor(bloc),
    actualCents: actualByBloc[bloc],
    expectedRemainingCents: remainingByBloc[bloc],
    projectedCents: actualByBloc[bloc] + remainingByBloc[bloc],
  }));

  const projectedOut = blocs.reduce((sum, b) => sum + b.projectedCents, 0);
  const cautiousOut = blocs.reduce(
    (sum, b) =>
      sum +
      (phase === 'PAST'
        ? b.projectedCents
        : Math.max(b.projectedCents, b.plannedCents)),
    0,
  );

  return {
    month,
    asOf: startOfUtcDay(today),
    income,
    blocs,
    projectedBalanceCents: income.projectedCents - projectedOut,
    cautiousBalanceCents: income.projectedCents - cautiousOut,
    occurrences,
  };
}
