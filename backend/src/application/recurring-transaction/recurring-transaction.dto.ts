import { TransactionCategory } from '../../domain/transaction/transaction-category';

export interface RecurringTransactionDto {
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
