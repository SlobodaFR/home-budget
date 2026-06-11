import { TransactionCategory } from '../../domain/transaction/transaction-category';

export interface TransactionDto {
  id: string;
  accountId: string;
  label: string;
  category: TransactionCategory;
  amountCents: number;
  date: string;
}
