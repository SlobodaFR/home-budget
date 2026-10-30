import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { describeError, isOfflineError } from '../../application/error-message';
import { useMonthData } from '../../application/use-month-data';
import { useOfflineQueue } from '../../application/use-offline-queue';
import { useSelectedMonth } from '../../application/use-selected-month';
import { useSpace } from '../../application/use-space';
import { Transaction } from '../../domain/budget';
import { pendingForMonth } from '../../domain/offline-queue';
import { ErrorNotice, OfflineNotice } from '../components/ErrorNotice';
import { UploadIcon } from '../components/Icons';
import { LoadingScreen } from '../components/LoadingScreen';
import { MonthPicker } from '../components/MonthPicker';
import { SummaryCard } from '../components/SummaryCard';
import { useToast } from '../components/Toast';
import { TransactionList } from '../components/TransactionList';
import { useQuickEntry } from '../layout/QuickEntryContext';

export function HomePage() {
  const { space } = useSpace();
  const { month, setMonth } = useSelectedMonth();
  const { summary, transactions, removeTransaction } = useMonthData(space.id, month);
  const { pending } = useOfflineQueue();
  const quickEntry = useQuickEntry();
  const toast = useToast();

  const handleDelete = async (transaction: Transaction) => {
    try {
      await removeTransaction(transaction.id);
      toast.show('Opération supprimée');
    } catch (error) {
      toast.show(describeError(error, 'Suppression impossible.'), 'error');
    }
  };

  const pendingItems = pendingForMonth(pending, space.id, month);
  const offline = isOfflineError(summary.error) || isOfflineError(transactions.error);
  const retry = () => {
    summary.reload();
    transactions.reload();
  };

  useEffect(() => {
    if (!offline) {
      return undefined;
    }
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  });

  return (
    <>
      <MonthPicker month={month} onChange={setMonth} />
      <Link
        to="/import"
        className="-mt-sm inline-flex min-h-[44px] items-center justify-center gap-sm self-center rounded-full px-md font-body-sm text-body-sm font-semibold underline"
      >
        <UploadIcon width={18} height={18} />
        Importer un relevé
      </Link>

      {summary.data ? (
        <SummaryCard summary={summary.data} />
      ) : offline ? (
        <OfflineNotice message="Hors ligne : les chiffres du mois reviendront avec le réseau." onRetry={retry} />
      ) : summary.error ? (
        <ErrorNotice message={describeError(summary.error, 'Impossible de charger la synthèse du mois.')} onRetry={summary.reload} />
      ) : (
        <LoadingScreen />
      )}

      <section aria-label="Opérations du mois">
        <h3 className="mb-sm font-label-caps text-label-caps uppercase text-mute">Opérations</h3>
        {transactions.data ? (
          <TransactionList transactions={transactions.data} pending={pendingItems} onEdit={quickEntry.openEdit} onDelete={handleDelete} />
        ) : offline ? (
          pendingItems.length > 0 && <TransactionList transactions={[]} pending={pendingItems} onEdit={quickEntry.openEdit} onDelete={handleDelete} />
        ) : transactions.error ? (
          <ErrorNotice message={describeError(transactions.error, 'Impossible de charger les opérations.')} onRetry={transactions.reload} />
        ) : (
          <LoadingScreen />
        )}
      </section>
    </>
  );
}
