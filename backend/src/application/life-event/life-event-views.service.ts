import { Injectable } from '@nestjs/common';
import { Clock } from '../../domain/shared/clock';
import { findDefinition } from '../../domain/life-event/catalog';
import { LifeEvent } from '../../domain/life-event/life-event';
import {
  LifeEventView,
  buildLifeEventView,
} from '../../domain/life-event/life-event-view';
import { LifeEventRepository } from '../../domain/life-event/life-event.repository';

/** Construit les vues (étapes du catalogue, statuts à la date du jour) des événements d'un foyer. */
@Injectable()
export class LifeEventViewsService {
  constructor(
    private readonly events: LifeEventRepository,
    private readonly clock: Clock,
  ) {}

  async forHousehold(householdId: string): Promise<LifeEventView[]> {
    const events = await this.events.findByHousehold(householdId);
    return events.flatMap((event) => {
      const view = this.view(event);
      return view ? [view] : [];
    });
  }

  /** null si le type n'existe plus au catalogue (l'événement reste en base, invisible). */
  view(event: LifeEvent): LifeEventView | null {
    const definition = findDefinition(event.type);
    return definition
      ? buildLifeEventView(event, definition, this.clock.now())
      : null;
  }
}
