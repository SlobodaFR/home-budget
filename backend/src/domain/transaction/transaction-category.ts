export const TRANSACTION_CATEGORIES = [
  'Logement',
  'Alimentation',
  'Transport',
  'Loisirs',
  'Sante',
  'Revenus',
  'Autre',
] as const;

export type TransactionCategory = (typeof TRANSACTION_CATEGORIES)[number];
