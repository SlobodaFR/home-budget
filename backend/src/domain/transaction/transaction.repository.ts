import { Transaction } from './transaction';

/** Port (driven side). Les operations d'un espace personnel sont chiffrees par l'infrastructure. */
export abstract class TransactionRepository {
  /** Operations dont la date est dans [from, to[, la plus recente d'abord. */
  abstract findBySpaceAndPeriod(
    spaceId: string,
    from: Date,
    to: Date,
  ): Promise<Transaction[]>;
  abstract findById(id: string): Promise<Transaction | null>;
  abstract save(transaction: Transaction): Promise<void>;
  /** Enregistre tout ou rien. */
  abstract saveMany(transactions: Transaction[]): Promise<void>;
  abstract delete(id: string): Promise<void>;
}
