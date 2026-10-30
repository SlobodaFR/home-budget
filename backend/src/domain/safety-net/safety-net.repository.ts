import { SafetyNet } from './safety-net';

/** Port (driven side). Une épargne de sécurité par foyer. */
export abstract class SafetyNetRepository {
  /** null tant que le foyer n'a rien déclaré. */
  abstract find(householdId: string): Promise<SafetyNet | null>;
  abstract save(householdId: string, safetyNet: SafetyNet): Promise<void>;
}
