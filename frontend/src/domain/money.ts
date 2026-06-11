const FORMATTER = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

export function formatCents(cents: number): string {
  return FORMATTER.format(cents / 100);
}

export function formatSignedCents(cents: number): string {
  const sign = cents > 0 ? '+ ' : cents < 0 ? '- ' : '';
  return `${sign}${FORMATTER.format(Math.abs(cents) / 100)}`;
}
