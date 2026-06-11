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

export interface TransactionItem {
  id: string;
  accountId: string;
  label: string;
  category: TransactionCategory;
  amountCents: number;
  date: string;
}
