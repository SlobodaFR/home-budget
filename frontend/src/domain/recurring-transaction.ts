import { TransactionCategory } from './transaction';
import { AccountType } from './account';

export interface RecurringTransaction {
  id: string;
  accountId: string;
  label: string;
  category: TransactionCategory;
  amountCents: number;
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  active: boolean;
}

export interface AccountForecast {
  id: string;
  name: string;
  type: AccountType;
  icon: string;
  currentBalanceCents: number;
  projectedBalanceCents: number;
}

export interface UpcomingOccurrence {
  recurringTransactionId: string;
  accountId: string;
  label: string;
  category: TransactionCategory;
  amountCents: number;
  date: string;
  estimated: boolean;
}

export interface BalanceForecast {
  asOfDate: string;
  targetDate: string;
  accounts: AccountForecast[];
  totalCurrentBalanceCents: number;
  totalProjectedBalanceCents: number;
  upcomingOccurrences: UpcomingOccurrence[];
}
