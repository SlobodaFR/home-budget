import { Account } from './account';

/** Port (driven side). Nom et solde d'ouverture d'un espace personnel sont chiffrés par l'infrastructure. */
export abstract class AccountRepository {
  abstract findBySpace(spaceId: string): Promise<Account[]>;
  abstract findById(id: string): Promise<Account | null>;
  abstract save(account: Account): Promise<void>;
  abstract delete(id: string): Promise<void>;
}
