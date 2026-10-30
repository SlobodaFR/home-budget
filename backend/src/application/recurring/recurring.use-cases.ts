import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AidRuleId } from '../../domain/aid/aid-rules';
import { RecurringItem } from '../../domain/recurring/recurring-item';
import { RecurringItemRepository } from '../../domain/recurring/recurring-item.repository';
import { Bloc } from '../../domain/shared/bloc';
import { Money } from '../../domain/shared/money';
import { Space } from '../../domain/space/space';
import { TransactionKind } from '../../domain/transaction/transaction';
import { AccountAssignmentService } from '../account/account-assignment.service';
import { SpaceAccessService } from '../household/space-access.service';
import { RecurringItemDto, toRecurringItemDto } from './recurring.dto';

export interface SaveRecurringCommand {
  kind: TransactionKind;
  bloc?: Bloc | null;
  label: string;
  amountCents: number;
  dayOfMonth?: number | null;
  startDate: string;
  endDate?: string | null;
  active: boolean;
  /** Validé par le domaine : une valeur inconnue est refusée en 400. */
  aidRuleId?: string | null;
  accountId?: string | null;
}

@Injectable()
export class ListRecurringItemsUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly recurring: RecurringItemRepository,
  ) {}

  async execute(userId: string, spaceId: string): Promise<RecurringItemDto[]> {
    await this.access.requireSpace(userId, spaceId);
    const items = await this.recurring.findBySpace(spaceId);
    return items.sort(compareItems).map(toRecurringItemDto);
  }
}

@Injectable()
export class CreateRecurringItemUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly recurring: RecurringItemRepository,
    private readonly assignment: AccountAssignmentService,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    command: SaveRecurringCommand,
  ): Promise<RecurringItemDto> {
    const space = await this.access.requireSpace(userId, spaceId);
    const accountId = await this.assignment.resolve(spaceId, command.accountId);
    const item = buildItem(randomUUID(), space, command, accountId);
    await this.recurring.save(item);
    return toRecurringItemDto(item);
  }
}

@Injectable()
export class UpdateRecurringItemUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly recurring: RecurringItemRepository,
    private readonly assignment: AccountAssignmentService,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    id: string,
    command: SaveRecurringCommand,
  ): Promise<void> {
    const space = await this.access.requireSpace(userId, spaceId);
    const existing = await this.recurring.findById(id);
    if (!existing || existing.spaceId !== spaceId) {
      throw new NotFoundException('Paiement récurrent introuvable');
    }
    const accountId = await this.assignment.resolve(
      spaceId,
      command.accountId,
      existing.accountId,
    );
    await this.recurring.save(buildItem(id, space, command, accountId));
  }
}

@Injectable()
export class DeleteRecurringItemUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly recurring: RecurringItemRepository,
  ) {}

  async execute(userId: string, spaceId: string, id: string): Promise<void> {
    await this.access.requireSpace(userId, spaceId);
    const existing = await this.recurring.findById(id);
    if (!existing || existing.spaceId !== spaceId) {
      throw new NotFoundException('Paiement récurrent introuvable');
    }
    await this.recurring.delete(id);
  }
}

function buildItem(
  id: string,
  space: Space,
  command: SaveRecurringCommand,
  accountId: string | null,
): RecurringItem {
  return RecurringItem.createIn(space, {
    id,
    spaceId: space.id,
    kind: command.kind,
    bloc: command.bloc ?? null,
    label: command.label,
    amount: Money.fromCents(command.amountCents),
    dayOfMonth: command.dayOfMonth ?? null,
    startDate: command.startDate,
    endDate: command.endDate ?? null,
    active: command.active,
    aidRuleId: (command.aidRuleId ?? null) as AidRuleId | null,
    accountId,
  });
}

/** Ordre stable : jour du mois (inconnu en dernier), puis libellé. */
function compareItems(a: RecurringItem, b: RecurringItem): number {
  return (
    (a.dayOfMonth ?? 99) - (b.dayOfMonth ?? 99) ||
    a.label.localeCompare(b.label) ||
    a.id.localeCompare(b.id)
  );
}
