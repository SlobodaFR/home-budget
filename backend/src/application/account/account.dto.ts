import { AccountKind } from '../../domain/account/account';
import { AccountView } from '../../domain/account/account-balance';

export interface AccountDto {
  id: string;
  spaceId: string;
  name: string;
  kind: AccountKind;
  openingBalanceCents: number;
  openingDate: string;
  archived: boolean;
  balanceCents: number;
  projectedMonthEndCents: number;
  transactionCount: number;
}

export function toAccountDto(view: AccountView): AccountDto {
  return {
    id: view.account.id,
    spaceId: view.account.spaceId,
    name: view.account.name,
    kind: view.account.kind,
    openingBalanceCents: view.account.openingBalanceCents,
    openingDate: view.account.openingDate,
    archived: view.account.archived,
    balanceCents: view.balanceCents,
    projectedMonthEndCents: view.projectedMonthEndCents,
    transactionCount: view.transactionCount,
  };
}
