import { RecurringTransaction } from './recurring-transaction';

/**
 * Port (driven side) implemented by the infrastructure layer.
 */
export abstract class RecurringTransactionRepository {
  abstract findAll(userId: string): Promise<RecurringTransaction[]>;
  abstract findById(id: string): Promise<RecurringTransaction | null>;
  abstract save(recurringTransaction: RecurringTransaction): Promise<void>;
  abstract delete(id: string): Promise<void>;
}
