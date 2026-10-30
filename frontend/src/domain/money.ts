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

const WHOLE_FORMATTER = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** Comme `formatCents`, mais sans les centimes quand le montant est rond : « 3 000 € », « 12,50 € ». */
export function formatCentsShort(cents: number): string {
  return cents % 100 === 0 ? WHOLE_FORMATTER.format(cents / 100) : FORMATTER.format(cents / 100);
}

/** Arrondi à l'euro, pour les moyennes et les estimations : « 1 367 € ». */
export function formatCentsRounded(cents: number): string {
  return WHOLE_FORMATTER.format(Math.round(cents / 100));
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

/** Montant signé en euros (« -150 », « − 1 200,50 », « +30 ») → centimes, ou `null` si illisible. Le découvert se saisit avec un « - ». */
export function parseSignedAmountToCents(input: string): number | null {
  const trimmed = input.trim();
  const negative = /^[-−–]/.test(trimmed);
  const unsigned = trimmed.replace(/^[-−–+]\s*/, '');
  const cents = parseAmountToCents(unsigned);
  if (cents === null) {
    return null;
  }
  return negative && cents !== 0 ? -cents : cents;
}

/** Valeur à remettre dans un champ de saisie pour un montant signé. */
export function signedCentsToInputValue(cents: number): string {
  return cents < 0 ? `-${centsToInputValue(-cents)}` : centsToInputValue(cents);
}
