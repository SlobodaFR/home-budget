import { Transaction } from './transaction';

/** Port (driven side). Les operations d'un espace personnel sont chiffrees par l'infrastructure. */
export abstract class TransactionRepository {
  /** Operations dont la date est dans [from, to[, la plus recente d'abord. */
  abstract findBySpaceAndPeriod(
    spaceId: string,
    from: Date,
    to: Date,
  ): Promise<Transaction[]>;
  /** Opérations dont la date est >= from (sans borne haute), la plus ancienne d'abord. */
  abstract findBySpaceFrom(spaceId: string, from: Date): Promise<Transaction[]>;
  /** Date de la dernière opération de l'espace, null s'il n'y en a aucune. */
  abstract findLatestDate(spaceId: string): Promise<Date | null>;
  abstract findById(id: string): Promise<Transaction | null>;
  abstract save(transaction: Transaction): Promise<void>;
  /** Enregistre tout ou rien. */
  abstract saveMany(transactions: Transaction[]): Promise<void>;
  abstract delete(id: string): Promise<void>;
}
