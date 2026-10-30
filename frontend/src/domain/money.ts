const FORMATTER = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

const PERCENT_FORMATTER = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 1,
});

export const MAX_AMOUNT_CENTS = 1_000_000_000;

export function formatCents(cents: number): string {
  return FORMATTER.format(cents / 100);
}

export function formatSignedCents(cents: number): string {
  const sign = cents > 0 ? '+ ' : cents < 0 ? '- ' : '';
  return `${sign}${FORMATTER.format(Math.abs(cents) / 100)}`;
}

export function formatRatio(ratio: number): string {
  return PERCENT_FORMATTER.format(ratio);
}

const AMOUNT_PATTERN = /^(?:\d+(?:[.,]\d{0,2})?|[.,]\d{1,2})$/;

export function parseAmountToCents(input: string): number | null {
  const cleaned = input.replace(/[\s  ]/g, '').replace(/€/g, '');
  if (!AMOUNT_PATTERN.test(cleaned)) {
    return null;
  }
  const [integerPart, decimalPart = ''] = cleaned.replace(',', '.').split('.');
  const cents = Number(integerPart || '0') * 100 + Number(decimalPart.padEnd(2, '0'));
  return cents <= MAX_AMOUNT_CENTS ? cents : null;
}

export function centsToInputValue(cents: number): string {
  const euros = Math.floor(cents / 100);
  const remainder = cents % 100;
  return remainder === 0 ? String(euros) : `${euros},${String(remainder).padStart(2, '0')}`;
}
