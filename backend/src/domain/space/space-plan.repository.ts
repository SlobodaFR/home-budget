import { SpacePlan } from './space-plan';

/** Port (driven side). Le plan d'un espace personnel est chiffre par l'infrastructure. */
export abstract class SpacePlanRepository {
  abstract find(spaceId: string): Promise<SpacePlan | null>;
  abstract save(spaceId: string, plan: SpacePlan): Promise<void>;
}
