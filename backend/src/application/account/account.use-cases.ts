import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Account, AccountKind } from '../../domain/account/account';
import { AccountRepository } from '../../domain/account/account.repository';
import { buildAccountViews } from '../../domain/account/account-balance';
import { DomainError } from '../../domain/shared/domain-error';
import { RecurringItemRepository } from '../../domain/recurring/recurring-item.repository';
import { TransactionRepository } from '../../domain/transaction/transaction.repository';
import { SpaceAccessService } from '../household/space-access.service';
import { AccountViewsService } from './account-views.service';
import { AccountDto, toAccountDto } from './account.dto';

export interface SaveAccountCommand {
  name: string;
  kind: AccountKind;
  openingBalanceCents: number;
  openingDate: string;
  /** Pris en compte à la modification seulement. */
  archived?: boolean;
}

@Injectable()
export class ListAccountsUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly views: AccountViewsService,
  ) {}

  async execute(userId: string, spaceId: string): Promise<AccountDto[]> {
    await this.access.requireSpace(userId, spaceId);
    return (await this.views.forSpace(spaceId)).map(toAccountDto);
  }
}

@Injectable()
export class CreateAccountUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly accounts: AccountRepository,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    command: SaveAccountCommand,
  ): Promise<AccountDto> {
    await this.access.requireSpace(userId, spaceId);
    const account = Account.create({
      id: randomUUID(),
      spaceId,
      name: command.name,
      kind: command.kind,
      openingBalanceCents: command.openingBalanceCents,
      openingDate: command.openingDate,
      archived: false,
    });
    await assertNameIsFree(this.accounts, spaceId, account.name, null);
    await this.accounts.save(account);
    // Un compte neuf n'a ni opération ni récurrent : solde = ouverture.
    return toAccountDto(buildAccountViews([account], [], [])[0]);
  }
}

@Injectable()
export class UpdateAccountUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly accounts: AccountRepository,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    id: string,
    command: SaveAccountCommand,
  ): Promise<void> {
    await this.access.requireSpace(userId, spaceId);
    const existing = await requireInSpace(this.accounts, id, spaceId);
    const updated = Account.create({
      id,
      spaceId,
      name: command.name,
      kind: command.kind,
      openingBalanceCents: command.openingBalanceCents,
      openingDate: command.openingDate,
      archived: command.archived ?? existing.archived,
    });
    await assertNameIsFree(this.accounts, spaceId, updated.name, id);
    await this.accounts.save(updated);
  }
}

@Injectable()
export class DeleteAccountUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly accounts: AccountRepository,
    private readonly transactions: TransactionRepository,
    private readonly recurring: RecurringItemRepository,
  ) {}

  async execute(userId: string, spaceId: string, id: string): Promise<void> {
    await this.access.requireSpace(userId, spaceId);
    await requireInSpace(this.accounts, id, spaceId);
    const [operations, templates] = await Promise.all([
      this.transactions.countByAccount(id),
      this.recurring.countByAccount(id),
    ]);
    if (operations > 0 || templates > 0) {
      throw new DomainError(
        'Ce compte est utilisé par des opérations ou des paiements récurrents : archivez-le plutôt que de le supprimer',
      );
    }
    await this.accounts.delete(id);
  }
}

async function requireInSpace(
  accounts: AccountRepository,
  id: string,
  spaceId: string,
): Promise<Account> {
  const account = await accounts.findById(id);
  if (!account || account.spaceId !== spaceId) {
    throw new NotFoundException('Compte introuvable');
  }
  return account;
}

/** Le nom est unique dans l'espace, à la casse près (hors le compte modifié). */
async function assertNameIsFree(
  accounts: AccountRepository,
  spaceId: string,
  name: string,
  exceptId: string | null,
): Promise<void> {
  const others = (await accounts.findBySpace(spaceId)).filter(
    (a) => a.id !== exceptId,
  );
  if (others.some((a) => a.hasSameNameAs(name))) {
    throw new DomainError('Un compte porte déjà ce nom dans cet espace');
  }
}
