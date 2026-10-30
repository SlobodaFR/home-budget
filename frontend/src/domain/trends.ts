import { Bloc, isBloc } from './bloc';
import { formatCentsShort } from './money';
import { isMonth, monthNumberOf, monthName, monthShortName } from './month';

/** Les fenêtres proposées, en mois (le serveur accepte de 3 à 24). */
export const TREND_WINDOWS = [3, 6, 12] as const;
export type TrendWindow = (typeof TREND_WINDOWS)[number];
export const DEFAULT_TREND_WINDOW: TrendWindow = 6;

/** Il faut au moins 4 mois pour comparer la moitié récente à la moitié ancienne (règle du serveur). */
export const MIN_MONTHS_FOR_RISERS = 4;

export interface TrendMonth {
  month: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  /** Entier, négatif possible ; 0 s'il n'y a pas de revenu. */
  savingsRatePercent: number;
  blocs: Record<Bloc, number>;
}

export interface TrendAverages {
  incomeCents: number;
  expenseCents: number;
  savingsRatePercent: number;
}

export interface TopLabel {
  label: string;
  totalCents: number;
  monthlyAverageCents: number;
  /** Variation (entier signé) entre la moitié récente et la moitié ancienne ; `null` si la moitié ancienne est vide. */
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
  averages: TrendAverages;
  topLabels: TopLabel[];
  risers: Riser[];
}

export const MAX_TOP_LABELS = 8;
export const MAX_RISERS = 5;

// ---------------------------------------------------------------------------------------------------------------------
// Lecture tolérante des réponses du serveur
// ---------------------------------------------------------------------------------------------------------------------

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const asObject = (value: unknown): Record<string, unknown> => (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const asCents = (value: unknown): number => (isNumber(value) ? Math.round(value) : 0);

function parseMonth(raw: unknown): TrendMonth | null {
  const item = asObject(raw);
  if (typeof item.month !== 'string' || !isMonth(item.month)) {
    return null;
  }
  const incomeCents = asCents(item.incomeCents);
  const expenseCents = asCents(item.expenseCents);
  const balanceCents = isNumber(item.balanceCents) ? Math.round(item.balanceCents) : incomeCents - expenseCents;
  const blocsRaw = asObject(item.blocs);
  const blocs = { FIXE: 0, COURANT: 0, PLAISIR: 0, EPARGNE: 0 } as Record<Bloc, number>;
  for (const key of Object.keys(blocsRaw)) {
    if (isBloc(key)) {
      blocs[key] = asCents(blocsRaw[key]);
    }
  }
  return {
    month: item.month,
    incomeCents,
    expenseCents,
    balanceCents,
    savingsRatePercent: isNumber(item.savingsRatePercent) ? Math.round(item.savingsRatePercent) : incomeCents > 0 ? Math.round((balanceCents / incomeCents) * 100) : 0,
    blocs,
  };
}

/** Lit la réponse sans jamais planter : mois dans l'ordre chronologique, éléments illisibles ignorés, moyennes recalculées si absentes. */
export function parseTrends(raw: unknown): Trends {
  const source = asObject(raw);
  const months: TrendMonth[] = [];
  if (Array.isArray(source.months)) {
    for (const entry of source.months as unknown[]) {
      const month = parseMonth(entry);
      if (month) {
        months.push(month);
      }
    }
  }
  months.sort((a, b) => (a.month === b.month ? 0 : a.month < b.month ? -1 : 1));

  const averagesRaw = asObject(source.averages);
  const count = months.length;
  const mean = (pick: (month: TrendMonth) => number) => (count === 0 ? 0 : Math.round(months.reduce((sum, month) => sum + pick(month), 0) / count));
  const averageIncome = isNumber(averagesRaw.incomeCents) ? Math.round(averagesRaw.incomeCents) : mean((month) => month.incomeCents);
  const averageExpense = isNumber(averagesRaw.expenseCents) ? Math.round(averagesRaw.expenseCents) : mean((month) => month.expenseCents);

  const topLabels: TopLabel[] = [];
  if (Array.isArray(source.topLabels)) {
    for (const entry of source.topLabels as unknown[]) {
      const item = asObject(entry);
      if (typeof item.label !== 'string' || !isNumber(item.totalCents)) {
        continue;
      }
      topLabels.push({
        label: item.label,
        totalCents: Math.round(item.totalCents),
        monthlyAverageCents: isNumber(item.monthlyAverageCents) ? Math.round(item.monthlyAverageCents) : count > 0 ? Math.round(item.totalCents / count) : 0,
        trendPercent: isNumber(item.trendPercent) ? Math.round(item.trendPercent) : null,
      });
    }
  }

  const risers: Riser[] = [];
  if (Array.isArray(source.risers)) {
    for (const entry of source.risers as unknown[]) {
      const item = asObject(entry);
      if (typeof item.label !== 'string' || !isNumber(item.recentAverageCents) || !isNumber(item.previousAverageCents)) {
        continue;
      }
      const recent = Math.round(item.recentAverageCents);
      const previous = Math.round(item.previousAverageCents);
      risers.push({ label: item.label, recentAverageCents: recent, previousAverageCents: previous, deltaCents: isNumber(item.deltaCents) ? Math.round(item.deltaCents) : recent - previous });
    }
  }

  return {
    from: typeof source.from === 'string' && isMonth(source.from) ? source.from : (months[0]?.month ?? ''),
    to: typeof source.to === 'string' && isMonth(source.to) ? source.to : (months[count - 1]?.month ?? ''),
    months,
    averages: {
      incomeCents: averageIncome,
      expenseCents: averageExpense,
      savingsRatePercent: isNumber(averagesRaw.savingsRatePercent)
        ? Math.round(averagesRaw.savingsRatePercent)
        : averageIncome > 0
          ? Math.round(((averageIncome - averageExpense) / averageIncome) * 100)
          : 0,
    },
    topLabels: topLabels.sort((a, b) => b.totalCents - a.totalCents).slice(0, MAX_TOP_LABELS),
    risers: risers.sort((a, b) => b.deltaCents - a.deltaCents).slice(0, MAX_RISERS),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Libellés
// ---------------------------------------------------------------------------------------------------------------------

export const windowLabel = (months: number): string => `${months} mois`;

/** « janv. » (mois seul) ou « janv. 26 » quand la fenêtre chevauche deux années. */
export function shortMonthLabel(month: string): string {
  const number = monthNumberOf(month);
  return number === null ? month : monthShortName(number);
}

export function longMonthLabel(month: string): string {
  const number = monthNumberOf(month);
  return number === null ? month : `${monthName(number)} ${month.slice(0, 4)}`;
}

/** « 8 % » ; « — » quand il n'y a pas de revenu moyen (un taux n'aurait pas de sens). */
export function describeAverageSavings(averages: Pick<TrendAverages, 'incomeCents' | 'savingsRatePercent'>): string {
  return averages.incomeCents > 0 ? `${averages.savingsRatePercent} %` : '—';
}

/** La phrase qui explique le taux d'épargne moyen. */
export function describeSavingsSentence(averages: Pick<TrendAverages, 'incomeCents' | 'savingsRatePercent'>, monthsCount: number): string {
  if (averages.incomeCents <= 0) {
    return 'Aucun revenu n’est enregistré sur cette période : le taux d’épargne ne peut pas être calculé.';
  }
  const period = monthsCount > 1 ? `sur ${monthsCount} mois` : 'ce mois-ci';
  const percent = averages.savingsRatePercent;
  if (percent < 0) {
    return `En moyenne ${period}, vous dépensez plus que vous ne gagnez (${percent} %). Regardez « Où va l’argent » ci-dessous pour trouver où alléger.`;
  }
  if (percent === 0) {
    return `En moyenne ${period}, vous dépensez tout ce que vous gagnez : rien n’est mis de côté.`;
  }
  return `En moyenne ${period}, il vous reste ${percent} % de vos revenus après les dépenses. C’est ce qui peut aller en épargne : un taux régulier compte plus qu’un gros mois isolé.`;
}

export type TrendDirection = 'up' | 'down' | 'flat' | 'unknown';

export function trendDirection(percent: number | null): TrendDirection {
  if (percent === null) {
    return 'unknown';
  }
  return percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat';
}

/** « En hausse de 12 % », « En baisse de 5 % », « Stable », « Pas de comparaison » : toujours écrit, la flèche n'est qu'un renfort. */
export function describeTrend(percent: number | null): string {
  switch (trendDirection(percent)) {
    case 'up':
      return `En hausse de ${percent} %`;
    case 'down':
      return `En baisse de ${Math.abs(percent as number)} %`;
    case 'flat':
      return 'Stable';
    default:
      return 'Pas de comparaison possible';
  }
}

export const TREND_EXPLANATION = 'La tendance compare la moitié la plus récente de la période à la moitié la plus ancienne.';

/** « Passe de 50 € à 90 € par mois (+ 40 € par mois). » */
export function describeRiser(riser: Pick<Riser, 'previousAverageCents' | 'recentAverageCents' | 'deltaCents'>): string {
  return `Passe de ${formatCentsShort(riser.previousAverageCents)} à ${formatCentsShort(riser.recentAverageCents)} par mois (+ ${formatCentsShort(riser.deltaCents)} par mois).`;
}

export const RISERS_RULE = 'Une dépense apparaît ici quand sa moyenne mensuelle récente dépasse l’ancienne d’au moins 20 € et d’au moins 20 %.';

export function describeNoRisers(monthsCount: number): string {
  return monthsCount < MIN_MONTHS_FOR_RISERS
    ? `Il faut au moins ${MIN_MONTHS_FOR_RISERS} mois pour repérer une dépense qui grimpe : choisissez une période plus longue.`
    : 'Rien ne grimpe de façon marquée : vos dépenses sont stables. C’est une bonne nouvelle.';
}

export function hasAnyActivity(trends: Pick<Trends, 'months'>): boolean {
  return trends.months.some((month) => month.incomeCents !== 0 || month.expenseCents !== 0);
}

// ---------------------------------------------------------------------------------------------------------------------
// Graphiques
// ---------------------------------------------------------------------------------------------------------------------

/** Hauteur de barre (0-100) pour un montant, sur une échelle de 0 à `max` ; une barre non nulle reste visible (au moins 2). */
export function barPercent(cents: number, max: number): number {
  if (max <= 0 || cents <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(2, Math.round((cents / max) * 100)));
}

export function maxIncomeExpense(months: readonly TrendMonth[]): number {
  return months.reduce((max, month) => Math.max(max, month.incomeCents, month.expenseCents), 0);
}

export function maxAbsBalance(months: readonly TrendMonth[]): number {
  return months.reduce((max, month) => Math.max(max, Math.abs(month.balanceCents)), 0);
}

export function describeBalanceOfMonth(balanceCents: number): string {
  if (balanceCents > 0) {
    return `solde positif de ${formatCentsShort(balanceCents)}`;
  }
  return balanceCents < 0 ? `solde négatif de ${formatCentsShort(-balanceCents)}` : 'solde à l’équilibre';
}

/** Le texte alternatif complet du graphique « Revenus et dépenses » : un mois par phrase, tous les chiffres. */
export function describeIncomeExpenseChart(months: readonly TrendMonth[]): string {
  if (months.length === 0) {
    return 'Aucune donnée.';
  }
  const lines = months.map((month) => `${longMonthLabel(month.month)} : revenus ${formatCentsShort(month.incomeCents)}, dépenses ${formatCentsShort(month.expenseCents)}`);
  return `Revenus et dépenses de chaque mois. ${lines.join(' ; ')}.`;
}

export function describeBalanceChart(months: readonly TrendMonth[]): string {
  if (months.length === 0) {
    return 'Aucune donnée.';
  }
  const lines = months.map((month) => `${longMonthLabel(month.month)} : ${describeBalanceOfMonth(month.balanceCents)}`);
  return `Solde de chaque mois (revenus moins dépenses). ${lines.join(' ; ')}.`;
}
