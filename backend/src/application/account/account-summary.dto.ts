import { AccountType } from '../../domain/account/account-type.enum';

export interface AccountSummaryDto {
  id: string;
  name: string;
  type: AccountType;
  icon: string;
  balanceCents: number;
  monthlyBudgetCents: number | null;
}
