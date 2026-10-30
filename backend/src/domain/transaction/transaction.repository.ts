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
  /** Toutes les opérations de l'espace rattachées à un compte (tous mois confondus). */
  abstract findAttachedBySpace(spaceId: string): Promise<Transaction[]>;
  /**
   * Total versé par membre au titre de la contribution du mois `month` (AAAA-MM) :
   * revenus de l'espace dont `contributionMonth` = `month`, groupés par `contributionUserId`.
   * Réservé à l'espace commun (montants en clair). Un membre sans versement est absent.
   */
  abstract sumContributionsByUser(
    spaceId: string,
    month: string,
  ): Promise<Map<string, number>>;
  /** Nombre d'opérations rattachées au compte. */
  abstract countByAccount(accountId: string): Promise<number>;
  abstract findById(id: string): Promise<Transaction | null>;
  abstract save(transaction: Transaction): Promise<void>;
  /** Enregistre tout ou rien. */
  abstract saveMany(transactions: Transaction[]): Promise<void>;
  abstract delete(id: string): Promise<void>;
}
