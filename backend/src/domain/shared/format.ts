const NBSP = ' ';

const SHORT_MONTHS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

const LONG_MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** « 1 234,50 € » (espaces insécables) ; les euros ronds s'écrivent sans décimales. */
export function formatEuros(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = abs % 100;
  const grouped = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const decimals = rest === 0 ? '' : `,${String(rest).padStart(2, '0')}`;
  return `${sign}${grouped}${decimals}${NBSP}€`;
}

/** « 5 nov. » (jour et mois UTC). */
export function formatShortDate(date: Date): string {
  return `${date.getUTCDate()} ${SHORT_MONTHS[date.getUTCMonth()]}`;
}

/** « novembre 2026 » pour un mois `AAAA-MM`. */
export function formatMonthLabel(month: string): string {
  const [year, index] = month.split('-');
  return `${LONG_MONTHS[Number(index) - 1]} ${year}`;
}

/** Mois de la veille du premier jour de `month` (`AAAA-MM`). */
export function previousMonth(month: string): string {
  const [year, index] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, index - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Dixièmes de mois entiers en texte français : 32 devient « 3,2 ». */
export function formatTenths(tenths: number): string {
  const whole = Math.floor(tenths / 10);
  const decimal = tenths % 10;
  return decimal === 0 ? String(whole) : `${whole},${decimal}`;
}

export function plural(
  count: number,
  singular: string,
  pluralForm: string,
): string {
  return count > 1 ? pluralForm : singular;
}
