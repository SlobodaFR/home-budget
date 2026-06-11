import { RecurringTransaction } from '../../domain/recurring-transaction/recurring-transaction';
import { RecurringTransactionDto } from './recurring-transaction.dto';

export function toRecurringTransactionDto(
  recurringTransaction: RecurringTransaction,
): RecurringTransactionDto {
  return {
    id: recurringTransaction.id,
    accountId: recurringTransaction.accountId,
    label: recurringTransaction.label,
    category: recurringTransaction.category,
    amountCents: recurringTransaction.amount.toCents(),
    dayOfMonth: recurringTransaction.dayOfMonth,
    startDate: recurringTransaction.startDate.toISOString(),
    endDate: recurringTransaction.endDate
      ? recurringTransaction.endDate.toISOString()
      : null,
    active: recurringTransaction.active,
  };
}
