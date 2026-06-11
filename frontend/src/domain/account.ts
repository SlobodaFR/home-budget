export enum AccountType {
  SOURCE = 'SOURCE',
  EXPENSE = 'EXPENSE',
}

export interface AccountSummary {
  id: string;
  name: string;
  type: AccountType;
  icon: string;
  balanceCents: number;
  monthlyBudgetCents: number | null;
}
