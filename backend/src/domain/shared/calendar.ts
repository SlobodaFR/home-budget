import { DomainError } from './domain-error';

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export { DAY_MS };

/** Nombre de jours d'un mois (monthIndex : 0 = janvier), années bissextiles comprises. */
export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Minuit UTC du jour de `date`. */
export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** `AAAA-MM-JJ` (UTC) d'un instant. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Vrai pour une date civile réelle au format `AAAA-MM-JJ` (le 2026-02-30 n'existe pas). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  return (
    month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month - 1)
  );
}

/** Minuit UTC d'une date `AAAA-MM-JJ` ; DomainError si elle est invalide. */
export function parseIsoDate(value: string, fieldName = 'Date'): Date {
  if (!isIsoDate(value)) {
    throw new DomainError(`${fieldName} invalide, format attendu : AAAA-MM-JJ`);
  }
  return new Date(`${value}T00:00:00.000Z`);
}
