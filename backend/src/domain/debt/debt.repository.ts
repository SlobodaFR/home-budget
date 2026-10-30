import { Debt } from './debt';

/** Port (driven side). Nom, montants et taux d'un espace personnel sont chiffrés par l'infrastructure. */
export abstract class DebtRepository {
  abstract findBySpace(spaceId: string): Promise<Debt[]>;
  abstract findById(id: string): Promise<Debt | null>;
  abstract save(debt: Debt): Promise<void>;
  abstract delete(id: string): Promise<void>;
}
