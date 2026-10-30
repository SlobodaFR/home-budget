import { ClassificationRule } from './classification';

/** Port (driven side). Les regles d'un espace personnel sont chiffrees par l'infrastructure. */
export abstract class SpaceRulesRepository {
  /** null tant que l'utilisateur n'a rien enregistre (on utilise alors les regles de depart). */
  abstract find(spaceId: string): Promise<ClassificationRule[] | null>;
  abstract save(spaceId: string, rules: ClassificationRule[]): Promise<void>;
}
