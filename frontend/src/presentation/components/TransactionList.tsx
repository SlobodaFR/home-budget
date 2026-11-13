import { useAccounts } from '../../application/use-accounts';
import { Transaction } from '../../domain/budget';
import { PendingTransaction } from '../../domain/offline-queue';
import { PendingRow, ROW_GRID, TransactionRow } from './TransactionRow';

interface Props {
  transactions: Transaction[];
  pending: PendingTransaction[];
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => Promise<void>;
}

export function TransactionList({
  transactions,
  pending,
  onEdit,
  onDelete,
}: Props) {
  const { nameOf } = useAccounts();
  if (transactions.length === 0 && pending.length === 0) {
    return (
      <p className="rounded bg-soft-cloud p-gutter text-center font-body-sm text-body-sm text-mute">
        Aucune opération ce mois-ci.{' '}
        <span className="lg:hidden">Touchez « + » pour en ajouter une.</span>
        <span className="hidden lg:inline">
          Utilisez « Ajouter une opération » pour en ajouter une.
        </span>
      </p>
    );
  }

  return (
    <div className="lg:rounded lg:bg-white lg:px-md lg:shadow-[0_0_0_1px_#E5E5E5] lg:[container-type:inline-size]">
      <div
        aria-hidden="true"
        className={`hidden border-b border-hairline-soft py-md font-label-caps text-label-caps uppercase text-mute lg:pl-[18px] lg:pr-[56px] ${ROW_GRID}`}
      >
        <span>Date</span>
        <span>Libellé</span>
        <span>Bloc</span>
        <span className="hidden lg:[@container(min-width:680px)]:block">
          Compte
        </span>
        <span className="text-right lg:col-start-4 lg:[@container(min-width:680px)]:col-start-5">
          Montant
        </span>
      </div>
      <ul className="divide-y divide-hairline-soft">
        {pending.map((item) => (
          <PendingRow
            key={item.clientId}
            label={item.payload.label}
            amountCents={item.payload.amountCents}
            income={item.payload.kind === 'INCOME'}
            accountName={nameOf(item.payload.accountId)}
          />
        ))}
        {transactions.map((transaction) => (
          <TransactionRow
            key={transaction.id}
            transaction={transaction}
            accountName={nameOf(transaction.accountId)}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </ul>
    </div>
  );
}
