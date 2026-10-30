const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (value: number) => String(value).padStart(2, '0');

export function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

export function isMonth(value: string): boolean {
  return MONTH_PATTERN.test(value);
}

export function shiftMonth(month: string, delta: number): string {
  const match = MONTH_PATTERN.exec(month);
  if (!match) {
    throw new Error(`Mois invalide : ${month}`);
  }
  const index = Number(match[1]) * 12 + (Number(match[2]) - 1) + delta;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

export function formatMonthLabel(month: string): string {
  const match = MONTH_PATTERN.exec(month);
  if (!match) {
    return month;
  }
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, 1),
  );
}

export function todayInputValue(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isValidDateInput(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function monthOfDateInput(value: string): string {
  return value.slice(0, 7);
}

export function toApiDate(dateInput: string, now: Date = new Date()): string {
  if (dateInput === todayInputValue(now)) {
    return `${dateInput}T${now.toISOString().slice(11)}`;
  }
  return `${dateInput}T00:00:00.000Z`;
}

export function isoToDateInput(iso: string): string {
  return iso.slice(0, 10);
}

export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso));
}

export function formatLongDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date(iso));
}

export function formatDayMonth(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function currentYear(now: Date = new Date()): number {
  return now.getFullYear();
}

const SHORT_DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const LONG_DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** « 2026-01-05 » (ou un ISO complet) → « 5 janv. 2026 ». Renvoie la valeur telle quelle si elle est illisible. */
export function formatDateInput(value: string): string {
  const day = value.slice(0, 10);
  return isValidDateInput(day) ? SHORT_DATE_FORMAT.format(Date.parse(`${day}T00:00:00Z`)) : value;
}

/** « 2026-10-30 » → « 30 octobre 2026 ». */
export function formatLongDateInput(value: string): string {
  const day = value.slice(0, 10);
  return isValidDateInput(day) ? LONG_DATE_FORMAT.format(Date.parse(`${day}T00:00:00Z`)) : value;
}

const MONTH_NAME_FORMAT = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' });
const MONTH_SHORT_FORMAT = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' });

export function isMonthOfYear(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 12;
}

/** 10 → « octobre » (minuscules, pour les phrases). */
export function monthName(monthOfYear: number): string {
  return MONTH_NAME_FORMAT.format(Date.UTC(2026, monthOfYear - 1, 1));
}

/** 1 → « janv. ». */
export function monthShortName(monthOfYear: number): string {
  return MONTH_SHORT_FORMAT.format(Date.UTC(2026, monthOfYear - 1, 1));
}

/** « 2026-10 » → 10, ou `null` si ce n'est pas un mois. */
export function monthNumberOf(month: string): number | null {
  const match = MONTH_PATTERN.exec(month);
  return match ? Number(match[2]) : null;
}

/** `AAAA-MM-JJ` + n mois ; le jour est ramené à la fin du mois d'arrivée s'il n'y existe pas (31 janv. + 1 mois = 28 févr.). */
export function addMonths(dateInput: string, months: number): string {
  const match = DATE_PATTERN.exec(dateInput);
  if (!match) {
    throw new Error(`Date invalide : ${dateInput}`);
  }
  const index = Number(match[1]) * 12 + (Number(match[2]) - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(Math.min(Number(match[3]), lastDay))}`;
}
