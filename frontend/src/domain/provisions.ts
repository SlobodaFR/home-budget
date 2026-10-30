import { Bloc, isBloc } from './bloc';
import { isMonthOfYear } from './month';
import { RecurringFrequency } from './recurring';

export interface ProvisionItem {
  recurringId: string;
  label: string;
  bloc: Bloc | null;
  /** `null` si le serveur ne l'a pas précisé : on n'invente pas de périodicité. */
  frequency: RecurringFrequency | null;
  amountCents: number;
  /** `AAAA-MM-JJ`. */
  nextDueDate: string;
  monthsUntilDue: number;
  monthlyProvisionCents: number;
  /** Toujours `null` pour l'instant : le suivi des provisions viendra avec les projets. */
  provisionedSoFarCents: number | null;
}

export interface Provisions {
  asOf: string;
  items: ProvisionItem[];
  totalMonthlyProvisionCents: number;
  totalNextTwelveMonthsCents: number;
}

const isCents = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Lit la réponse du serveur sans jamais planter : les lignes illisibles sont ignorées, les totaux manquants recalculés. */
export function parseProvisions(raw: unknown): Provisions {
  const source = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(source.items) ? (source.items as unknown[]) : [];
  const items: ProvisionItem[] = [];
  for (const entry of list) {
    const item = (entry ?? {}) as Record<string, unknown>;
    if (typeof item.recurringId !== 'string' || typeof item.label !== 'string' || !isCents(item.amountCents)) {
      continue;
    }
    items.push({
      recurringId: item.recurringId,
      label: item.label,
      bloc: isBloc(item.bloc) ? item.bloc : null,
      frequency: item.frequency === 'QUARTERLY' || item.frequency === 'YEARLY' ? item.frequency : null,
      amountCents: item.amountCents,
      nextDueDate: typeof item.nextDueDate === 'string' ? item.nextDueDate : '',
      monthsUntilDue: isCents(item.monthsUntilDue) ? Math.max(0, Math.trunc(item.monthsUntilDue)) : 0,
      monthlyProvisionCents: isCents(item.monthlyProvisionCents) ? item.monthlyProvisionCents : 0,
      provisionedSoFarCents: isCents(item.provisionedSoFarCents) ? item.provisionedSoFarCents : null,
    });
  }
  const sorted = sortProvisions(items);
  return {
    asOf: typeof source.asOf === 'string' ? source.asOf : '',
    items: sorted,
    totalMonthlyProvisionCents: isCents(source.totalMonthlyProvisionCents)
      ? source.totalMonthlyProvisionCents
      : sorted.reduce((sum, item) => sum + item.monthlyProvisionCents, 0),
    totalNextTwelveMonthsCents: isCents(source.totalNextTwelveMonthsCents) ? source.totalNextTwelveMonthsCents : 0,
  };
}

/** Par prochaine échéance croissante (le serveur trie déjà : on ne s'y fie pas). Une date illisible passe en dernier. */
export function sortProvisions(items: readonly ProvisionItem[]): ProvisionItem[] {
  return [...items].sort((a, b) => {
    if (a.nextDueDate === b.nextDueDate) {
      return a.label.localeCompare(b.label, 'fr');
    }
    if (a.nextDueDate === '') {
      return 1;
    }
    if (b.nextDueDate === '') {
      return -1;
    }
    return a.nextDueDate < b.nextDueDate ? -1 : 1;
  });
}

/** « ce mois-ci », « dans 1 mois », « dans 11 mois ». */
export function describeMonthsUntil(months: number): string {
  if (months <= 0) {
    return 'ce mois-ci';
  }
  return `dans ${months} mois`;
}

/** Mois d'une échéance `AAAA-MM-JJ`, ou `null`. */
export function dueMonthOf(item: Pick<ProvisionItem, 'nextDueDate'>): number | null {
  const month = Number(item.nextDueDate.slice(5, 7));
  return isMonthOfYear(month) ? month : null;
}
