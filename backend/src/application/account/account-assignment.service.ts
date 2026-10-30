import { Injectable } from '@nestjs/common';
import { AccountRepository } from '../../domain/account/account.repository';
import { assertAccountUsable } from '../../domain/account/account';

/**
 * Valide le rattachement d'une opération ou d'un paiement récurrent à un compte :
 * même espace, non archivé (sauf rattachement existant conservé tel quel).
 * Une violation est une DomainError (400).
 */
@Injectable()
export class AccountAssignmentService {
  constructor(private readonly accounts: AccountRepository) {}

  async resolve(
    spaceId: string,
    accountId: string | null | undefined,
    currentAccountId: string | null = null,
  ): Promise<string | null> {
    if (accountId === null || accountId === undefined) {
      return null;
    }
    const account = await this.accounts.findById(accountId);
    assertAccountUsable(account, spaceId, accountId === currentAccountId);
    return accountId;
  }
}
