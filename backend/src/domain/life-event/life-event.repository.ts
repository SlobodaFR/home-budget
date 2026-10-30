import { LifeEvent } from './life-event';

/** Port (driven side). Les événements de vie appartiennent au foyer (jamais à un espace personnel). */
export abstract class LifeEventRepository {
  /** Du plus récent au plus ancien (date de l'événement, puis création). */
  abstract findByHousehold(householdId: string): Promise<LifeEvent[]>;
  abstract findById(id: string): Promise<LifeEvent | null>;
  /** Crée ou remplace l'événement et l'état de ses étapes, en une transaction. */
  abstract save(event: LifeEvent): Promise<void>;
  /** Supprime l'événement et l'état de ses étapes, en une transaction. */
  abstract delete(id: string): Promise<void>;
}
