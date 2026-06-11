import { Money } from '../shared/money';
import { TransactionCategory } from '../transaction/transaction-category';

export interface RecurringTransactionProps {
  id: string;
  accountId: string;
  label: string;
  category: TransactionCategory;
  amount: Money;
  /** Day of month (1-31) the payment usually falls on. Null = no precise date known (estimated). */
  dayOfMonth: number | null;
  startDate: Date;
  endDate: Date | null;
  active: boolean;
}

/**
 * A RecurringTransaction is a forecast template: it does not represent money
 * that has actually moved, but a recurring pattern (e.g. "rent on the 5th of
 * every month" or "social security reimbursement, date unknown") used to
 * project future balances.
 */
export class RecurringTransaction {
  private constructor(private readonly props: RecurringTransactionProps) {
    if (!props.label.trim()) {
      throw new Error('Recurring transaction label must not be empty');
    }
    if (props.amount.toCents() === 0) {
      throw new Error('Recurring transaction amount must not be zero');
    }
    if (
      props.dayOfMonth !== null &&
      (props.dayOfMonth < 1 || props.dayOfMonth > 31)
    ) {
      throw new Error('Day of month must be between 1 and 31');
    }
    if (props.endDate && props.endDate < props.startDate) {
      throw new Error('End date must not be before start date');
    }
  }

  static create(props: RecurringTransactionProps): RecurringTransaction {
    return new RecurringTransaction(props);
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

  get dayOfMonth(): number | null {
    return this.props.dayOfMonth;
  }

  get startDate(): Date {
    return this.props.startDate;
  }

  get endDate(): Date | null {
    return this.props.endDate;
  }

  get active(): boolean {
    return this.props.active;
  }

  /** Whether the date falls within [startDate, endDate]. */
  isActiveOn(date: Date): boolean {
    if (!this.props.active) {
      return false;
    }
    if (date < this.props.startDate) {
      return false;
    }
    if (this.props.endDate && date > this.props.endDate) {
      return false;
    }
    return true;
  }

  /**
   * The projected occurrence date (UTC) for a given month. Falls back to the
   * last day of the month if dayOfMonth is unset or exceeds the month's length.
   */
  occurrenceDateForMonth(year: number, month: number): Date {
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const day = Math.min(this.props.dayOfMonth ?? lastDay, lastDay);
    return new Date(Date.UTC(year, month, day));
  }

  /**
   * All projected occurrence dates strictly after `from` and up to and
   * including `to`, restricted to the [startDate, endDate] active range.
   */
  occurrencesBetween(from: Date, to: Date): Date[] {
    if (!this.props.active || to < from) {
      return [];
    }

    const occurrences: Date[] = [];
    let year = from.getUTCFullYear();
    let month = from.getUTCMonth();

    while (
      year < to.getUTCFullYear() ||
      (year === to.getUTCFullYear() && month <= to.getUTCMonth())
    ) {
      const occurrence = this.occurrenceDateForMonth(year, month);
      if (
        occurrence > from &&
        occurrence <= to &&
        this.isActiveOn(occurrence)
      ) {
        occurrences.push(occurrence);
      }
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }

    return occurrences;
  }
}
