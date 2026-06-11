import { RecurringTransaction } from '../../domain/recurring-transaction';
import { TransactionCategory } from '../../domain/transaction';
import { formatSignedCents } from '../../domain/money';

const CATEGORY_ICONS: Record<TransactionCategory, string> = {
  Logement: 'home',
  Alimentation: 'shopping_cart',
  Transport: 'train',
  Loisirs: 'stadia_controller',
  Sante: 'favorite',
  Revenus: 'payments',
  Autre: 'receipt_long',
};

interface RecurringTransactionRowProps {
  recurringTransaction: RecurringTransaction;
  accountName: string;
  onEdit: (recurringTransaction: RecurringTransaction) => void;
  onDelete: (recurringTransaction: RecurringTransaction) => void;
}

export function RecurringTransactionRow({
  recurringTransaction,
  accountName,
  onEdit,
  onDelete,
}: RecurringTransactionRowProps) {
  const isCredit = recurringTransaction.amountCents > 0;
  const dayLabel =
    recurringTransaction.dayOfMonth !== null
      ? `Le ${recurringTransaction.dayOfMonth} de chaque mois`
      : 'Date inconnue (estime fin de mois)';

  return (
    <div className="flex items-center justify-between py-xl border-b border-hairline-soft hover:bg-soft-cloud px-md transition-colors group">
      <div className="flex items-center gap-xl">
        <div
          className={`w-12 h-12 flex items-center justify-center rounded-full ${
            recurringTransaction.active ? 'bg-ink text-surface' : 'bg-soft-cloud text-mute'
          }`}
        >
          <span className="material-symbols-outlined">{CATEGORY_ICONS[recurringTransaction.category]}</span>
        </div>
        <div>
          <p className="font-heading-lg text-heading-lg text-ink">{recurringTransaction.label}</p>
          <p className="font-body-sm text-body-sm text-mute">
            {accountName} - {dayLabel}
            {!recurringTransaction.active && ' - Inactif'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-md">
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            className="material-symbols-outlined text-mute hover:text-ink p-1 text-base"
            onClick={() => onEdit(recurringTransaction)}
            aria-label={`Modifier ${recurringTransaction.label}`}
          >
            edit
          </button>
          <button
            type="button"
            className="material-symbols-outlined text-mute hover:text-error p-1 text-base"
            onClick={() => onDelete(recurringTransaction)}
            aria-label={`Supprimer ${recurringTransaction.label}`}
          >
            delete
          </button>
        </div>
        <p className={`font-heading-lg text-heading-lg text-right ${isCredit ? 'text-success' : 'text-ink'}`}>
          {formatSignedCents(recurringTransaction.amountCents)}
        </p>
      </div>
    </div>
  );
}
