import { Transaction } from './transaction';

/**
 * Port (driven side) implemented by the infrastructure layer.
 */
export abstract class TransactionRepository {
  abstract findAll(limit?: number, userId?: string): Promise<Transaction[]>;
  abstract findById(id: string): Promise<Transaction | null>;
  abstract findByAccountId(accountId: string): Promise<Transaction[]>;
  abstract save(transaction: Transaction): Promise<void>;
  abstract delete(id: string): Promise<void>;
}
