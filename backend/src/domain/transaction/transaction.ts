import { Money } from '../shared/money';
import { TransactionCategory } from './transaction-category';

export interface TransactionProps {
  id: string;
  accountId: string;
  label: string;
  category: TransactionCategory;
  amount: Money;
  date: Date;
}

/**
 * A Transaction belongs to exactly one Account. Its amount is signed:
 * positive for a credit (money in), negative for a debit (money out).
 */
export class Transaction {
  private constructor(private readonly props: TransactionProps) {
    if (!props.label.trim()) {
      throw new Error('Transaction label must not be empty');
    }
    if (props.amount.toCents() === 0) {
      throw new Error('Transaction amount must not be zero');
    }
  }

  static create(props: TransactionProps): Transaction {
    return new Transaction(props);
  }

  get id(): string {
    return this.props.id;
  }

  get accountId(): string {
    return this.props.accountId;
  }

  get label(): string {
    return this.props.label;
  }

  get category(): TransactionCategory {
    return this.props.category;
  }

  get amount(): Money {
    return this.props.amount;
  }

  get date(): Date {
    return this.props.date;
  }

  isCredit(): boolean {
    return !this.props.amount.isNegative();
  }
}
