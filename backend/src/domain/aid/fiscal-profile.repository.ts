import { FiscalProfile } from './fiscal-profile';

/** Port (driven side). Un profil fiscal par foyer. */
export abstract class FiscalProfileRepository {
  /** null tant que le foyer n'a rien déclaré. */
  abstract find(householdId: string): Promise<FiscalProfile | null>;
  abstract save(householdId: string, profile: FiscalProfile): Promise<void>;
}
