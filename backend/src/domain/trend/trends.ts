import { normalizeText } from '../import/classification';
import { Bloc } from '../shared/bloc';
import { DomainError } from '../shared/domain-error';
import { roundDivSigned } from '../shared/rounding';
import { Transaction } from '../transaction/transaction';

export const MIN_TREND_MONTHS = 3;
export const MAX_TREND_MONTHS = 24;
export const DEFAULT_TREND_MONTHS = 6;
/** Pas de fenêtre qui commence avant cette année. */
export const MIN_TREND_YEAR = 2000;
export const MAX_TOP_LABELS = 8;
export const MAX_RISERS = 5;
/** Les `risers` n'ont de sens qu'avec au moins 4 mois (deux par moitié). */
export const MIN_RISER_MONTHS = 4;
/** Hausse minimale d'un riser : 20 € par mois ET 20 %. */
export const RISER_MIN_DELTA_CENTS = 2000;
export const RISER_MIN_DELTA_PERCENT = 20;
/** Hausse minimale pour le conseil `spending-riser` : 50 € par mois. */
export const SPENDING_RISER_MIN_DELTA_CENTS = 5000;
/** Fenêtre du conseil `spending-riser`. */
export const SPENDING_RISER_WINDOW_MONTHS = 6;

export interface TrendMonth {
  month: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  savingsRatePercent: number;
  blocs: Record<Bloc, number>;
}

export interface TopLabel {
  label: string;
  totalCents: number;
  monthlyAverageCents: number;
  /** Variation entière signée entre la moitié récente et la moitié ancienne ; null si l'ancienne est vide. */
  trendPercent: number | null;
}

export interface Riser {
  label: string;
  recentAverageCents: number;
  previousAverageCents: number;
  deltaCents: number;
}

export interface Trends {
  from: string;
  to: string;
  months: TrendMonth[];
  averages: {
    incomeCents: number;
    expenseCents: number;
    savingsRatePercent: number;
  };
  topLabels: TopLabel[];
  risers: Riser[];
}

/** `AAAA-MM` décalé de `delta` mois (négatif = passé). */
export function shiftMonth(month: string, delta: number): string {
  const [year, index] = month.split('-').map(Number);
  const total = year * 12 + (index - 1) + delta;
  const y = Math.floor(total / 12);
  return `${y}-${String(total - y * 12 + 1).padStart(2, '0')}`;
}

/** Les `count` mois se terminant à `toMonth` (inclus), du plus ancien au plus récent. */
export function windowMonths(toMonth: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    shiftMonth(toMonth, i - (count - 1)),
  );
}

/** Rejette une fenêtre invalide : 3 à 24 mois, démarrage en 2000 au plus tôt. */
export function assertValidWindow(toMonth: string, count: number): void {
  if (
    !Number.isInteger(count) ||
    count < MIN_TREND_MONTHS ||
    count > MAX_TREND_MONTHS
  ) {
    throw new DomainError(
      `La fenêtre doit couvrir de ${MIN_TREND_MONTHS} à ${MAX_TREND_MONTHS} mois`,
    );
  }
  if (Number(shiftMonth(toMonth, -(count - 1)).slice(0, 4)) < MIN_TREND_YEAR) {
    throw new DomainError(
      `La fenêtre ne peut pas commencer avant ${MIN_TREND_YEAR}`,
    );
  }
}

/**
 * Clé de regroupement d'un libellé : normalisation commune (casse, accents,
 * espaces : `normalizeText`) puis chaque suite de chiffres est compressée en
 * `#`, pour que « CARTE 1234 » et « CARTE 5678 » forment un seul groupe.
 */
export function labelGroupKey(label: string): string {
  return normalizeText(label).replace(/\d+/g, '#');
}

const monthOf = (t: Transaction) => t.date.toISOString().slice(0, 7);

interface Group {
  totalByMonth: Map<string, number>;
  /** Libellé exact -> (occurrences, dernière date). */
  labels: Map<string, { count: number; latest: number; latestId: string }>;
}

/** Libellé affiché : le plus fréquent du groupe, à égalité le plus récent (puis identifiant). */
function displayLabel(group: Group): string {
  return [...group.labels.entries()].sort(
    ([la, a], [lb, b]) =>
      b.count - a.count ||
      b.latest - a.latest ||
      b.latestId.localeCompare(a.latestId) ||
      la.localeCompare(lb),
  )[0][0];
}

/** Moyenne entière (arrondi inférieur) : aucune division flottante. */
const floorDiv = (n: number, d: number) => Math.floor(n / d);

/**
 * Tendances d'une fenêtre de mois à partir des seules opérations de cette fenêtre.
 *
 * - `months`, `averages` : revenus et dépenses de tous les blocs. Les dépenses
 *   du bloc EPARGNE restent comptées dans `blocs` et `expenseCents` (c'est de
 *   l'argent sorti du compte), comme dans le résumé du mois.
 * - `topLabels`, `risers` : les dépenses du bloc EPARGNE en sont EXCLUES (un
 *   virement vers un livret n'est pas un poste de dépense à surveiller).
 * - Découpe en moitiés : h = ⌊n/2⌋ ; ancienne = les h premiers mois, récente =
 *   les h derniers ; avec un nombre IMPAIR de mois, le mois du milieu n'entre
 *   dans aucune moitié (deux moitiés de même taille : les totaux sont
 *   directement comparables).
 * - Moyennes (mensuelles, de moitié) : arrondi inférieur ; taux d'épargne et
 *   `trendPercent` : entier le plus proche, la moitié s'éloignant de zéro.
 * - Tout est en entiers.
 */
export function buildTrends(
  toMonth: string,
  count: number,
  transactions: Transaction[],
): Trends {
  assertValidWindow(toMonth, count);
  const monthKeys = windowMonths(toMonth, count);
  const index = new Map(monthKeys.map((m, i) => [m, i]));

  const months: TrendMonth[] = monthKeys.map((month) => ({
    month,
    incomeCents: 0,
    expenseCents: 0,
    balanceCents: 0,
    savingsRatePercent: 0,
    blocs: { FIXE: 0, COURANT: 0, PLAISIR: 0, EPARGNE: 0 },
  }));
  const groups = new Map<string, Group>();

  for (const t of transactions) {
    const position = index.get(monthOf(t));
    if (position === undefined) {
      continue; // hors fenêtre : ignoré
    }
    const month = months[position];
    const cents = t.amount.toCents();
    if (t.kind === 'INCOME') {
      month.incomeCents += cents;
      continue;
    }
    month.expenseCents += cents;
    if (!t.bloc) {
      continue;
    }
    month.blocs[t.bloc] += cents;
    if (t.bloc === 'EPARGNE') {
      continue; // exclu de topLabels / risers
    }
    const key = labelGroupKey(t.label);
    const group: Group = groups.get(key) ?? {
      totalByMonth: new Map(),
      labels: new Map(),
    };
    group.totalByMonth.set(
      monthOf(t),
      (group.totalByMonth.get(monthOf(t)) ?? 0) + cents,
    );
    const seen = group.labels.get(t.label);
    const time = t.date.getTime();
    const newer =
      !seen ||
      time > seen.latest ||
      (time === seen.latest && t.id > seen.latestId);
    group.labels.set(t.label, {
      count: (seen?.count ?? 0) + 1,
      latest: newer ? time : seen.latest,
      latestId: newer ? t.id : seen.latestId,
    });
    groups.set(key, group);
  }

  for (const m of months) {
    m.balanceCents = m.incomeCents - m.expenseCents;
    m.savingsRatePercent =
      m.incomeCents > 0
        ? roundDivSigned(m.balanceCents * 100, m.incomeCents)
        : 0;
  }

  const totalIncome = months.reduce((s, m) => s + m.incomeCents, 0);
  const totalExpense = months.reduce((s, m) => s + m.expenseCents, 0);

  const half = Math.floor(count / 2);
  const older = monthKeys.slice(0, half);
  const recent = monthKeys.slice(count - half);
  const sum = (group: Group, keys: string[]) =>
    keys.reduce((s, k) => s + (group.totalByMonth.get(k) ?? 0), 0);

  const topLabels: TopLabel[] = [];
  const risers: Riser[] = [];
  for (const group of groups.values()) {
    const label = displayLabel(group);
    const total = sum(group, monthKeys);
    const recentTotal = sum(group, recent);
    const olderTotal = sum(group, older);
    topLabels.push({
      label,
      totalCents: total,
      monthlyAverageCents: floorDiv(total, count),
      trendPercent:
        olderTotal > 0
          ? roundDivSigned((recentTotal - olderTotal) * 100, olderTotal)
          : null,
    });
    if (count >= MIN_RISER_MONTHS) {
      const recentAverage = floorDiv(recentTotal, half);
      const previousAverage = floorDiv(olderTotal, half);
      const delta = recentAverage - previousAverage;
      if (
        delta >= RISER_MIN_DELTA_CENTS &&
        delta * 100 >= RISER_MIN_DELTA_PERCENT * previousAverage
      ) {
        risers.push({
          label,
          recentAverageCents: recentAverage,
          previousAverageCents: previousAverage,
          deltaCents: delta,
        });
      }
    }
  }

  const byLabel = (a: { label: string }, b: { label: string }) =>
    a.label.localeCompare(b.label, 'fr');
  return {
    from: monthKeys[0],
    to: toMonth,
    months,
    averages: {
      incomeCents: floorDiv(totalIncome, count),
      expenseCents: floorDiv(totalExpense, count),
      savingsRatePercent:
        totalIncome > 0
          ? roundDivSigned((totalIncome - totalExpense) * 100, totalIncome)
          : 0,
    },
    topLabels: topLabels
      .sort((a, b) => b.totalCents - a.totalCents || byLabel(a, b))
      .slice(0, MAX_TOP_LABELS),
    risers: risers
      .sort((a, b) => b.deltaCents - a.deltaCents || byLabel(a, b))
      .slice(0, MAX_RISERS),
  };
}

/**
 * Pour le conseil `spending-riser` : le premier riser (plus forte hausse) d'au
 * moins 50 € par mois, sur une fenêtre de 6 mois au plus se terminant à
 * `toMonth`. La fenêtre est RACCOURCIE au premier mois qui a des opérations :
 * sans cela, un espace jeune verrait tous ses postes « monter » depuis une
 * moitié ancienne vide. Moins de 4 mois de données (premier mois d'opération
 * compris) : aucun conseil.
 */
export function findSpendingRiser(
  toMonth: string,
  transactions: Transaction[],
): Riser | null {
  const full = windowMonths(toMonth, SPENDING_RISER_WINDOW_MONTHS);
  const inWindow = transactions.filter((t) => full.includes(monthOf(t)));
  if (inWindow.length === 0) {
    return null;
  }
  const first = inWindow.map(monthOf).sort()[0];
  const span = full.length - full.indexOf(first);
  if (span < MIN_RISER_MONTHS) {
    return null;
  }
  const [top] = buildTrends(toMonth, span, inWindow).risers;
  return top && top.deltaCents >= SPENDING_RISER_MIN_DELTA_CENTS ? top : null;
}
