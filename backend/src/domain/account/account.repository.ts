import { Account } from './account';

/**
 * Port (driven side) implemented by the infrastructure layer.
 */
export abstract class AccountRepository {
  abstract findAll(userId: string): Promise<Account[]>;
  abstract findById(id: string): Promise<Account | null>;
  abstract save(account: Account): Promise<void>;
  abstract delete(id: string): Promise<void>;
}
