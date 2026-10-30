import { RecurringItem } from './recurring-item';

/** Port (driven side). Libellé et montant d'un espace personnel sont chiffrés par l'infrastructure. */
export abstract class RecurringItemRepository {
  abstract findBySpace(spaceId: string): Promise<RecurringItem[]>;
  abstract findById(id: string): Promise<RecurringItem | null>;
  /** Nombre de gabarits rattachés au compte. */
  abstract countByAccount(accountId: string): Promise<number>;
  abstract save(item: RecurringItem): Promise<void>;
  abstract delete(id: string): Promise<void>;
}
