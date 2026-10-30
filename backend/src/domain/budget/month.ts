import { DomainError } from '../shared/domain-error';

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export interface MonthRange {
  /** Premier instant du mois (UTC), inclus. */
  from: Date;
  /** Premier instant du mois suivant (UTC), exclu. */
  to: Date;
}

export function parseMonth(month: string): MonthRange {
  const match = MONTH_PATTERN.exec(month);
  if (!match) {
    throw new DomainError('Mois invalide, format attendu : AAAA-MM');
  }
  const year = Number(match[1]);
  const index = Number(match[2]) - 1;
  return {
    from: new Date(Date.UTC(year, index, 1)),
    to: new Date(Date.UTC(year, index + 1, 1)),
  };
}

export function currentMonth(now: Date = new Date()): string {
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${now.getUTCFullYear()}-${month}`;
}
