import { RecurringFrequency, RecurringItem } from '../recurring/recurring-item';
import { daysInMonth, startOfUtcDay } from '../shared/calendar';
import { occurrenceDateInMonth } from './forecast';

/** On ne cherche pas une prochaine échéance au-delà de ce nombre de mois (10 ans). */
const MAX_SEARCH_MONTHS = 120;

export interface ProvisionItem {
  recurringId: string;
  label: string;
  bloc: NonNullable<RecurringItem['bloc']>;
  frequency: Exclude<RecurringFrequency, 'MONTHLY'>;
  amountCents: number;
  /** Prochaine occurrence à partir de `asOf` (incluse). */
  nextDueDate: Date;
  /** Mois entiers entre `asOf` et `nextDueDate`. */
  monthsUntilDue: number;
  monthlyProvisionCents: number;
}

export interface Provisions {
  /** Minuit UTC du jour de référence. */
  asOf: Date;
  /** Triés par échéance croissante (puis libellé). */
  items: ProvisionItem[];
  totalMonthlyProvisionCents: number;
  /** Somme des occurrences datées de [asOf, asOf + 12 mois[. */
  totalNextTwelveMonthsCents: number;
}

/** Prochaine occurrence (date) d'un gabarit à partir de `from` (incluse) ; null s'il n'y en a plus. */
export function nextOccurrenceDate(
  item: RecurringItem,
  from: Date,
): Date | null {
  const start = startOfUtcDay(from);
  for (let offset = 0; offset < MAX_SEARCH_MONTHS; offset++) {
    const found = occurrenceDateInMonth(
      item,
      start.getUTCFullYear(),
      start.getUTCMonth() + offset,
    );
    if (found && found.date.getTime() >= start.getTime()) {
      return found.date;
    }
  }
  return null;
}

/** `date` + `months` mois, le jour retombant sur le dernier jour du mois si besoin (30 janvier + 1 mois = 28 février). */
export function addMonthsClamped(date: Date, months: number): Date {
  const total = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const monthIndex = total - year * 12;
  return new Date(
    Date.UTC(
      year,
      monthIndex,
      Math.min(date.getUTCDate(), daysInMonth(year, monthIndex)),
    ),
  );
}

/** Mois entiers écoulés entre `from` et `to` (to >= from) : 30 oct. -> 15 oct. suivant = 11. */
export function wholeMonthsBetween(from: Date, to: Date): number {
  const diff =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth());
  // Un 31 janvier est « un mois » avant le 28 février : on compare au dernier jour du mois cible.
  const reachedDay = Math.min(
    from.getUTCDate(),
    daysInMonth(to.getUTCFullYear(), to.getUTCMonth()),
  );
  return to.getUTCDate() < reachedDay ? diff - 1 : diff;
}

/**
 * Dépenses non mensuelles actives et ce qu'il faut mettre de côté chaque mois
 * pour les lisser. Les revenus non mensuels n'ont pas de provision.
 */
export function buildProvisions(
  recurring: RecurringItem[],
  asOfInstant: Date,
): Provisions {
  const asOf = startOfUtcDay(asOfInstant);
  const windowEnd = addMonthsClamped(asOf, 12);

  const items: ProvisionItem[] = [];
  let nextTwelveMonths = 0;
  for (const item of recurring) {
    if (item.kind !== 'EXPENSE' || !item.active || !item.isNonMonthly()) {
      continue;
    }
    const nextDueDate = nextOccurrenceDate(item, asOf);
    if (!nextDueDate) {
      continue;
    }
    items.push({
      recurringId: item.id,
      label: item.label,
      bloc: item.bloc!,
      frequency: item.frequency as ProvisionItem['frequency'],
      amountCents: item.amount.toCents(),
      nextDueDate,
      monthsUntilDue: wholeMonthsBetween(asOf, nextDueDate),
      monthlyProvisionCents: item.monthlyProvisionCents(),
    });
    for (let offset = 0; offset <= 12; offset++) {
      const found = occurrenceDateInMonth(
        item,
        asOf.getUTCFullYear(),
        asOf.getUTCMonth() + offset,
      );
      if (
        found &&
        found.date.getTime() >= asOf.getTime() &&
        found.date.getTime() < windowEnd.getTime()
      ) {
        nextTwelveMonths += item.amount.toCents();
      }
    }
  }
  items.sort(
    (a, b) =>
      a.nextDueDate.getTime() - b.nextDueDate.getTime() ||
      a.label.localeCompare(b.label) ||
      a.recurringId.localeCompare(b.recurringId),
  );
  return {
    asOf,
    items,
    totalMonthlyProvisionCents: items.reduce(
      (sum, i) => sum + i.monthlyProvisionCents,
      0,
    ),
    totalNextTwelveMonthsCents: nextTwelveMonths,
  };
}
