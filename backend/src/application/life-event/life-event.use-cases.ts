import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  LIFE_EVENT_CATALOG,
  LifeEventDefinition,
  findDefinition,
} from '../../domain/life-event/catalog';
import {
  LifeEvent,
  assertEventDateInRange,
} from '../../domain/life-event/life-event';
import { LifeEventView } from '../../domain/life-event/life-event-view';
import { LifeEventRepository } from '../../domain/life-event/life-event.repository';
import { Clock } from '../../domain/shared/clock';
import { DomainError } from '../../domain/shared/domain-error';
import { SpaceAccessService } from '../household/space-access.service';
import { LifeEventViewsService } from './life-event-views.service';

/** Le catalogue est du code : il ne dépend d'aucun foyer (tout utilisateur authentifié le lit). */
@Injectable()
export class GetLifeEventCatalogUseCase {
  execute(): readonly LifeEventDefinition[] {
    return LIFE_EVENT_CATALOG;
  }
}

/** Les événements sont ceux du foyer : accès réservé à ses membres, 404 sinon. */
@Injectable()
export class ListLifeEventsUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly views: LifeEventViewsService,
  ) {}

  async execute(userId: string): Promise<LifeEventView[]> {
    const snapshot = await this.access.requireSnapshot(userId);
    return this.views.forHousehold(snapshot.household.id);
  }
}

export interface CreateLifeEventCommand {
  type: string;
  eventDate: string;
  label?: string;
}

@Injectable()
export class CreateLifeEventUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly events: LifeEventRepository,
    private readonly views: LifeEventViewsService,
    private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    command: CreateLifeEventCommand,
  ): Promise<LifeEventView> {
    const snapshot = await this.access.requireSnapshot(userId);
    const definition = findDefinition(command.type);
    if (!definition) {
      throw new DomainError("Type d'événement inconnu");
    }
    const now = this.clock.now();
    assertEventDateInRange(command.eventDate, now);
    const event = LifeEvent.create({
      id: randomUUID(),
      householdId: snapshot.household.id,
      type: definition.type,
      label: command.label ?? definition.label,
      eventDate: command.eventDate,
      createdAt: now,
      progress: [],
    });
    await this.events.save(event);
    return this.views.view(event)!;
  }
}

/** Un événement qui n'est pas celui du foyer de l'utilisateur n'existe pas pour lui (404). */
async function requireEvent(
  access: SpaceAccessService,
  events: LifeEventRepository,
  userId: string,
  id: string,
): Promise<LifeEvent> {
  const snapshot = await access.requireSnapshot(userId);
  const event = await events.findById(id);
  if (!event || event.householdId !== snapshot.household.id) {
    throw new NotFoundException('Événement introuvable');
  }
  return event;
}

export interface UpdateLifeEventCommand {
  eventDate: string;
  label: string;
}

@Injectable()
export class UpdateLifeEventUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly events: LifeEventRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    id: string,
    command: UpdateLifeEventCommand,
  ): Promise<void> {
    const event = await requireEvent(this.access, this.events, userId, id);
    // Changer seulement le libellé d'un vieil événement reste permis : la plage ne vaut que pour une nouvelle date.
    if (command.eventDate !== event.eventDate) {
      assertEventDateInRange(command.eventDate, this.clock.now());
    }
    await this.events.save(event.withDetails(command.label, command.eventDate));
  }
}

@Injectable()
export class DeleteLifeEventUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly events: LifeEventRepository,
  ) {}

  async execute(userId: string, id: string): Promise<void> {
    await requireEvent(this.access, this.events, userId, id);
    await this.events.delete(id);
  }
}

export interface SetLifeEventStepCommand {
  done: boolean;
  note?: string;
}

@Injectable()
export class SetLifeEventStepUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly events: LifeEventRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    id: string,
    stepId: string,
    command: SetLifeEventStepCommand,
  ): Promise<void> {
    const event = await requireEvent(this.access, this.events, userId, id);
    const known = findDefinition(event.type)?.steps.some(
      (s) => s.id === stepId,
    );
    if (!known) {
      throw new NotFoundException('Étape introuvable');
    }
    await this.events.save(
      event.withStep(stepId, command.done, this.clock.now(), command.note),
    );
  }
}
