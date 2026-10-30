import { RecurringItem } from '../domain/recurring/recurring-item';
import { Bloc } from '../domain/shared/bloc';
import { Money } from '../domain/shared/money';
import { Transaction } from '../domain/transaction/transaction';
import { AidRuleId } from '../domain/aid/aid-rules';

let counter = 0;

/** Opération de test : `date` est un ISO (`2026-11-05` suffit). */
export function tx(
  kind: 'INCOME' | 'EXPENSE',
  bloc: Bloc | null,
  label: string,
  cents: number,
  date: string,
  spaceId = 'common',
): Transaction {
  counter += 1;
  return Transaction.create({
    id: `tx-${counter}`,
    spaceId,
    kind,
    bloc,
    label,
    amount: Money.fromCents(cents),
    date: new Date(date.length === 10 ? `${date}T10:00:00Z` : date),
  });
}

export interface RecurringOverrides {
  id?: string;
  spaceId?: string;
  dayOfMonth?: number | null;
  startDate?: string;
  endDate?: string | null;
  active?: boolean;
  aidRuleId?: AidRuleId | null;
}

/** Gabarit récurrent de test (dépense FIXE par défaut, depuis le 2026-01-01, sans fin). */
export function rec(
  kind: 'INCOME' | 'EXPENSE',
  bloc: Bloc | null,
  label: string,
  cents: number,
  overrides: RecurringOverrides = {},
): RecurringItem {
  counter += 1;
  return RecurringItem.create({
    id: overrides.id ?? `rec-${counter}`,
    spaceId: overrides.spaceId ?? 'common',
    kind,
    bloc,
    label,
    amount: Money.fromCents(cents),
    dayOfMonth: overrides.dayOfMonth === undefined ? 5 : overrides.dayOfMonth,
    startDate: overrides.startDate ?? '2026-01-01',
    endDate: overrides.endDate ?? null,
    active: overrides.active ?? true,
    aidRuleId: overrides.aidRuleId ?? null,
  });
}
