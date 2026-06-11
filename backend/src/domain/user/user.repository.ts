import { User } from './user';

/**
 * Port (driven side) implemented by the infrastructure layer.
 */
export abstract class UserRepository {
  abstract findById(id: string): Promise<User | null>;
  abstract findByEmail(email: string): Promise<User | null>;
  abstract save(user: User): Promise<void>;
}
