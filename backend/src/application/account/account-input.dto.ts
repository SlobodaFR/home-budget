import { AccountType } from '../../domain/account/account-type.enum';

export interface AccountInput {
  name: string;
  type: AccountType;
  icon: string;
  monthlyBudgetCents: number | null;
}
