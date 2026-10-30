import { TransactionKind } from './budget';
import { formatCents } from './money';
import { monthName } from './month';

export interface YearForecastItem {
  recurringId: string;
  label: string;
  kind: TransactionKind;
  amountCents: number;
}

export interface YearForecastMonth {
  /** `AAAA-MM`. */
  month: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  cumulativeCents: number;
  peak: boolean;
  items: YearForecastItem[];
}

export interface YearForecast {
  year: number;
  months: YearForecastMonth[];
  totalIncomeCents: number;
  totalExpenseCents: number;
  provisionHintCents: number;
}

/** Nombre de lignes détaillées pour un mois pic. */
export const PEAK_ITEMS_SHOWN = 3;

const isCents = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Lit la réponse du serveur sans jamais planter : mois ou lignes illisibles ignorés, totaux manquants recalculés. */
export function parseYearForecast(raw: unknown, fallbackYear: number): YearForecast {
  const source = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(source.months) ? (source.months as unknown[]) : [];
  const months: YearForecastMonth[] = [];
  for (const entry of list) {
    const month = (entry ?? {}) as Record<string, unknown>;
    if (typeof month.month !== 'string' || !MONTH_KEY.test(month.month)) {
      continue;
    }
    const income = isCents(month.incomeCents) ? month.incomeCents : 0;
    const expense = isCents(month.expenseCents) ? month.expenseCents : 0;
    const items: YearForecastItem[] = [];
    for (const rawItem of Array.isArray(month.items) ? (month.items as unknown[]) : []) {
      const item = (rawItem ?? {}) as Record<string, unknown>;
      if (typeof item.label !== 'string' || !isCents(item.amountCents)) {
        continue;
      }
      items.push({
        recurringId: typeof item.recurringId === 'string' ? item.recurringId : item.label,
        label: item.label,
        kind: item.kind === 'INCOME' ? 'INCOME' : 'EXPENSE',
        amountCents: item.amountCents,
      });
    }
    months.push({
      month: month.month,
      incomeCents: income,
      expenseCents: expense,
      balanceCents: isCents(month.balanceCents) ? month.balanceCents : income - expense,
      cumulativeCents: isCents(month.cumulativeCents) ? month.cumulativeCents : 0,
      peak: month.peak === true,
      items,
    });
  }
  months.sort((a, b) => a.month.localeCompare(b.month));
  return {
    year: isCents(source.year) ? source.year : fallbackYear,
    months,
    totalIncomeCents: isCents(source.totalIncomeCents) ? source.totalIncomeCents : months.reduce((sum, m) => sum + m.incomeCents, 0),
    totalExpenseCents: isCents(source.totalExpenseCents) ? source.totalExpenseCents : months.reduce((sum, m) => sum + m.expenseCents, 0),
    provisionHintCents: isCents(source.provisionHintCents) ? Math.max(0, source.provisionHintCents) : 0,
  };
}

export function monthNumber(month: Pick<YearForecastMonth, 'month'>): number {
  return Number(month.month.slice(5, 7));
}

/** « Octobre » : le nom du mois avec une majuscule, pour les listes. */
export function monthTitle(month: Pick<YearForecastMonth, 'month'>): string {
  const name = monthName(monthNumber(month));
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function peakMonths(forecast: Pick<YearForecast, 'months'>): YearForecastMonth[] {
  return forecast.months.filter((month) => month.peak);
}

export function yearBalanceCents(forecast: Pick<YearForecast, 'totalIncomeCents' | 'totalExpenseCents'>): number {
  return forecast.totalIncomeCents - forecast.totalExpenseCents;
}

export function averageExpenseCents(forecast: Pick<YearForecast, 'months' | 'totalExpenseCents'>): number {
  return forecast.months.length === 0 ? 0 : Math.round(forecast.totalExpenseCents / forecast.months.length);
}

/** Les dépenses d'un mois, de la plus grosse à la plus petite, limitées à `limit` ; `hidden` = lignes non montrées. */
export function mainExpenseItems(
  month: Pick<YearForecastMonth, 'items'>,
  limit: number = PEAK_ITEMS_SHOWN,
): { shown: YearForecastItem[]; hidden: number } {
  const expenses = month.items
    .filter((item) => item.kind === 'EXPENSE')
    .sort((a, b) => b.amountCents - a.amountCents || a.label.localeCompare(b.label, 'fr'));
  return { shown: expenses.slice(0, limit), hidden: Math.max(0, expenses.length - limit) };
}

/** Hauteur d'une barre en % de la plus haute (0 pour une dépense nulle, au moins 4 % sinon pour qu'elle reste visible). */
export function barHeightPercent(expenseCents: number, maxExpenseCents: number): number {
  if (expenseCents <= 0 || maxExpenseCents <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(4, Math.round((expenseCents / maxExpenseCents) * 100)));
}

export function maxExpenseCents(forecast: Pick<YearForecast, 'months'>): number {
  return forecast.months.reduce((max, month) => Math.max(max, month.expenseCents), 0);
}

/** Texte alternatif de l'histogramme : chaque mois en toutes lettres, puis les pics. */
export function describeHistogram(forecast: Pick<YearForecast, 'months' | 'year'>): string {
  const parts = forecast.months.map((month) => `${monthName(monthNumber(month))} ${formatCents(month.expenseCents)}`);
  const peaks = peakMonths(forecast).map((month) => monthName(monthNumber(month)));
  const peakText = peaks.length > 0 ? ` Mois pics : ${peaks.join(', ')}.` : ' Aucun mois pic.';
  return `Dépenses prévues par mois en ${forecast.year} : ${parts.join(', ')}.${peakText}`;
}

export function describePeakSentence(peaks: readonly Pick<YearForecastMonth, 'month'>[]): string {
  if (peaks.length === 0) {
    return 'Aucun mois ne dépasse nettement les autres : votre année est bien répartie.';
  }
  const names = peaks.map((month) => monthName(monthNumber(month)));
  return peaks.length === 1
    ? `Un mois sort du lot : ${names[0]}. Mettez un peu de côté chaque mois pour l’aborder sereinement.`
    : `${peaks.length} mois sortent du lot : ${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}. Mettez un peu de côté chaque mois pour les aborder sereinement.`;
}
