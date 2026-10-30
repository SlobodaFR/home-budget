import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { parseMonth } from '../../domain/budget/month';
import {
  MonthSummary,
  summarizeMonth,
} from '../../domain/budget/month-summary';
import { Bloc } from '../../domain/shared/bloc';
import { Money } from '../../domain/shared/money';
import { SpacePlan } from '../../domain/space/space-plan';
import { SpacePlanRepository } from '../../domain/space/space-plan.repository';
import {
  Transaction,
  TransactionKind,
} from '../../domain/transaction/transaction';
import { TransactionRepository } from '../../domain/transaction/transaction.repository';
import { AccountAssignmentService } from '../account/account-assignment.service';
import { SpaceAccessService } from '../household/space-access.service';
import { TransactionDto, toTransactionDto } from './transaction.dto';

export interface SaveTransactionCommand {
  kind: TransactionKind;
  bloc?: Bloc | null;
  label: string;
  amountCents: number;
  date?: Date;
  accountId?: string | null;
}

@Injectable()
export class ListSpaceTransactionsUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly transactions: TransactionRepository,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    month: string,
  ): Promise<TransactionDto[]> {
    await this.access.requireSpace(userId, spaceId);
    const { from, to } = parseMonth(month);
    const list = await this.transactions.findBySpaceAndPeriod(
      spaceId,
      from,
      to,
    );
    return list.map(toTransactionDto);
  }
}

@Injectable()
export class CreateSpaceTransactionUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly transactions: TransactionRepository,
    private readonly assignment: AccountAssignmentService,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    command: SaveTransactionCommand,
  ): Promise<TransactionDto> {
    await this.access.requireSpace(userId, spaceId);
    const accountId = await this.assignment.resolve(spaceId, command.accountId);
    const transaction = buildTransaction(
      randomUUID(),
      spaceId,
      command,
      accountId,
    );
    await this.transactions.save(transaction);
    return toTransactionDto(transaction);
  }
}

@Injectable()
export class UpdateSpaceTransactionUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly transactions: TransactionRepository,
    private readonly assignment: AccountAssignmentService,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    id: string,
    command: SaveTransactionCommand,
  ): Promise<void> {
    await this.access.requireSpace(userId, spaceId);
    const existing = await this.transactions.findById(id);
    if (!existing || existing.spaceId !== spaceId) {
      throw new NotFoundException('Operation introuvable');
    }
    // Garder le compte d'origine reste permis même archivé (corriger un libellé ancien).
    const accountId = await this.assignment.resolve(
      spaceId,
      command.accountId,
      existing.accountId,
    );
    await this.transactions.save(
      buildTransaction(id, spaceId, command, accountId),
    );
  }
}

@Injectable()
export class DeleteSpaceTransactionUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly transactions: TransactionRepository,
  ) {}

  async execute(userId: string, spaceId: string, id: string): Promise<void> {
    await this.access.requireSpace(userId, spaceId);
    const existing = await this.transactions.findById(id);
    if (!existing || existing.spaceId !== spaceId) {
      throw new NotFoundException('Operation introuvable');
    }
    await this.transactions.delete(id);
  }
}

@Injectable()
export class GetMonthSummaryUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly plans: SpacePlanRepository,
    private readonly transactions: TransactionRepository,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    month: string,
  ): Promise<MonthSummary> {
    await this.access.requireSpace(userId, spaceId);
    const { from, to } = parseMonth(month);
    const [plan, list] = await Promise.all([
      this.plans.find(spaceId),
      this.transactions.findBySpaceAndPeriod(spaceId, from, to),
    ]);
    return summarizeMonth(month, plan ?? SpacePlan.empty(), list);
  }
}

function buildTransaction(
  id: string,
  spaceId: string,
  command: SaveTransactionCommand,
  accountId: string | null,
): Transaction {
  return Transaction.create({
    id,
    spaceId,
    kind: command.kind,
    bloc: command.bloc ?? null,
    label: command.label,
    amount: Money.fromCents(command.amountCents),
    date: command.date ?? new Date(),
    accountId,
  });
}
