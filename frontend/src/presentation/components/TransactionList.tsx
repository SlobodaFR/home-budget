import { useAccounts } from '../../application/use-accounts';
import { Transaction } from '../../domain/budget';
import { PendingTransaction } from '../../domain/offline-queue';
import { PendingRow, TransactionRow } from './TransactionRow';

interface Props {
  transactions: Transaction[];
  pending: PendingTransaction[];
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => Promise<void>;
}

export function TransactionList({ transactions, pending, onEdit, onDelete }: Props) {
  const { nameOf } = useAccounts();
  if (transactions.length === 0 && pending.length === 0) {
    return (
      <p className="rounded bg-soft-cloud p-gutter text-center font-body-sm text-body-sm text-mute">
        Aucune opération ce mois-ci. Touchez « + » pour en ajouter une.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-hairline-soft">
      {pending.map((item) => (
        <PendingRow key={item.clientId} label={item.payload.label} amountCents={item.payload.amountCents} income={item.payload.kind === 'INCOME'} accountName={nameOf(item.payload.accountId)} />
      ))}
      {transactions.map((transaction) => (
        <TransactionRow key={transaction.id} transaction={transaction} accountName={nameOf(transaction.accountId)} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </ul>
  );
}
