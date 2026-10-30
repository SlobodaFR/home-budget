import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  Debt,
  DebtKind,
  ratePercentToHundredths,
} from '../../domain/debt/debt';
import { DebtRepository } from '../../domain/debt/debt.repository';
import {
  DebtSummary,
  WhatIf,
  summarizeDebts,
  whatIf,
  buildDebtView,
} from '../../domain/debt/debt-view';
import { RecurringItemRepository } from '../../domain/recurring/recurring-item.repository';
import { Clock } from '../../domain/shared/clock';
import { DomainError } from '../../domain/shared/domain-error';
import { SpaceAccessService } from '../household/space-access.service';
import { DebtDto, toDebtDto } from './debt.dto';
import { DebtViewsService } from './debt-views.service';

export interface SaveDebtCommand {
  name: string;
  kind: DebtKind;
  principalCents: number;
  remainingCents: number;
  /** Pourcent avec 2 décimales au plus (3,9) ; converti en centièmes entiers. */
  annualRatePercent: number;
  monthlyPaymentCents: number;
  startDate: string;
  paymentDay: number;
  insuranceMonthlyCents: number;
  recurringId?: string | null;
  /** Pris en compte à la modification seulement ; absent = inchangé. */
  archived?: boolean;
}

async function requireDebt(
  debts: DebtRepository,
  id: string,
  spaceId: string,
): Promise<Debt> {
  const debt = await debts.findById(id);
  if (!debt || debt.spaceId !== spaceId) {
    throw new NotFoundException('Crédit introuvable');
  }
  return debt;
}

/** Le paiement récurrent qui représente la mensualité doit exister dans le même espace. */
async function resolveRecurring(
  recurring: RecurringItemRepository,
  spaceId: string,
  recurringId: string | null | undefined,
): Promise<string | null> {
  if (recurringId === null || recurringId === undefined) {
    return null;
  }
  const item = await recurring.findById(recurringId);
  if (!item || item.spaceId !== spaceId) {
    throw new DomainError("Ce paiement récurrent n'existe pas dans cet espace");
  }
  return recurringId;
}

function build(
  id: string,
  spaceId: string,
  command: SaveDebtCommand,
  recurringId: string | null,
  archived: boolean,
): Debt {
  return Debt.create({
    id,
    spaceId,
    name: command.name,
    kind: command.kind,
    principalCents: command.principalCents,
    remainingCents: command.remainingCents,
    annualRateHundredths: ratePercentToHundredths(command.annualRatePercent),
    monthlyPaymentCents: command.monthlyPaymentCents,
    startDate: command.startDate,
    paymentDay: command.paymentDay,
    insuranceMonthlyCents: command.insuranceMonthlyCents,
    archived,
    recurringId,
  });
}

@Injectable()
export class ListDebtsUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly views: DebtViewsService,
  ) {}

  async execute(userId: string, spaceId: string): Promise<DebtDto[]> {
    await this.access.requireSpace(userId, spaceId);
    return (await this.views.forSpace(spaceId)).map(toDebtDto);
  }
}

@Injectable()
export class GetDebtsSummaryUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly views: DebtViewsService,
  ) {}

  async execute(userId: string, spaceId: string): Promise<DebtSummary> {
    const space = await this.access.requireSpace(userId, spaceId);
    const [views, income] = await Promise.all([
      this.views.forSpace(spaceId),
      this.views.monthlyIncomeCents(userId, space),
    ]);
    return summarizeDebts(views, income);
  }
}

@Injectable()
export class CreateDebtUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly debts: DebtRepository,
    private readonly recurring: RecurringItemRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    command: SaveDebtCommand,
  ): Promise<DebtDto> {
    await this.access.requireSpace(userId, spaceId);
    const recurringId = await resolveRecurring(
      this.recurring,
      spaceId,
      command.recurringId,
    );
    const debt = build(randomUUID(), spaceId, command, recurringId, false);
    await this.debts.save(debt);
    return toDebtDto(buildDebtView(debt, this.clock.now()));
  }
}

@Injectable()
export class UpdateDebtUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly debts: DebtRepository,
    private readonly recurring: RecurringItemRepository,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    id: string,
    command: SaveDebtCommand,
  ): Promise<void> {
    await this.access.requireSpace(userId, spaceId);
    const existing = await requireDebt(this.debts, id, spaceId);
    const recurringId = await resolveRecurring(
      this.recurring,
      spaceId,
      command.recurringId,
    );
    await this.debts.save(
      build(
        id,
        spaceId,
        command,
        recurringId,
        command.archived ?? existing.archived,
      ),
    );
  }
}

@Injectable()
export class DeleteDebtUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly debts: DebtRepository,
  ) {}

  async execute(userId: string, spaceId: string, id: string): Promise<void> {
    await this.access.requireSpace(userId, spaceId);
    await requireDebt(this.debts, id, spaceId);
    await this.debts.delete(id);
  }
}

/** Simulation d'un remboursement accéléré : au moins un des deux montants doit être > 0. */
@Injectable()
export class DebtWhatIfUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly debts: DebtRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    id: string,
    extraMonthlyCents: number,
    lumpSumCents: number,
  ): Promise<WhatIf> {
    await this.access.requireSpace(userId, spaceId);
    const debt = await requireDebt(this.debts, id, spaceId);
    for (const value of [extraMonthlyCents, lumpSumCents]) {
      if (!Number.isInteger(value) || value < 0) {
        throw new DomainError(
          'Les montants de simulation doivent être des entiers positifs ou nuls',
        );
      }
    }
    if (extraMonthlyCents === 0 && lumpSumCents === 0) {
      throw new DomainError(
        'Indiquez un versement mensuel supplémentaire ou un remboursement partiel',
      );
    }
    return whatIf(debt, extraMonthlyCents, lumpSumCents, this.clock.now());
  }
}
