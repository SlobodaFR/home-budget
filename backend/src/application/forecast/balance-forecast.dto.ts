import { AccountType } from '../../domain/account/account-type.enum';
import { TransactionCategory } from '../../domain/transaction/transaction-category';

export interface AccountForecastDto {
  id: string;
  name: string;
  type: AccountType;
  icon: string;
  currentBalanceCents: number;
  projectedBalanceCents: number;
}

export interface UpcomingOccurrenceDto {
  recurringTransactionId: string;
  accountId: string;
  label: string;
  category: TransactionCategory;
  amountCents: number;
  date: string;
  estimated: boolean;
}

export interface BalanceForecastDto {
  asOfDate: string;
  targetDate: string;
  accounts: AccountForecastDto[];
  totalCurrentBalanceCents: number;
  totalProjectedBalanceCents: number;
  upcomingOccurrences: UpcomingOccurrenceDto[];
}
