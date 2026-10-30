import { Bloc } from '../../domain/shared/bloc';
import {
  Transaction,
  TransactionKind,
} from '../../domain/transaction/transaction';

export interface TransactionDto {
  id: string;
  spaceId: string;
  kind: TransactionKind;
  bloc: Bloc | null;
  label: string;
  amountCents: number;
  date: string;
  accountId: string | null;
}

export function toTransactionDto(transaction: Transaction): TransactionDto {
  return {
    id: transaction.id,
    spaceId: transaction.spaceId,
    kind: transaction.kind,
    bloc: transaction.bloc,
    label: transaction.label,
    amountCents: transaction.amount.toCents(),
    date: transaction.date.toISOString(),
    accountId: transaction.accountId,
  };
}
