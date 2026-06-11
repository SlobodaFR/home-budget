import { TransactionCategory, TransactionItem } from '../../domain/transaction';
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

const DATE_FORMATTER = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long' });

interface TransactionRowProps {
  transaction: TransactionItem;
  onEdit: (transaction: TransactionItem) => void;
  onDelete: (transaction: TransactionItem) => void;
}

export function TransactionRow({ transaction, onEdit, onDelete }: TransactionRowProps) {
  const isCredit = transaction.amountCents > 0;

  return (
    <div className="flex items-center justify-between py-xl border-b border-hairline-soft hover:bg-soft-cloud px-md transition-colors group">
      <div className="flex items-center gap-xl">
        <div className="w-12 h-12 flex items-center justify-center bg-ink text-surface rounded-full">
          <span className="material-symbols-outlined">{CATEGORY_ICONS[transaction.category]}</span>
        </div>
        <div>
          <p className="font-heading-lg text-heading-lg text-ink">{transaction.label}</p>
          <p className="font-body-sm text-body-sm text-mute">
            {DATE_FORMATTER.format(new Date(transaction.date))} - {transaction.category}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-md">
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            className="material-symbols-outlined text-mute hover:text-ink p-1 text-base"
            onClick={() => onEdit(transaction)}
            aria-label={`Modifier ${transaction.label}`}
          >
            edit
          </button>
          <button
            type="button"
            className="material-symbols-outlined text-mute hover:text-error p-1 text-base"
            onClick={() => onDelete(transaction)}
            aria-label={`Supprimer ${transaction.label}`}
          >
            delete
          </button>
        </div>
        <p className={`font-heading-lg text-heading-lg text-right ${isCredit ? 'text-success' : 'text-ink'}`}>
          {formatSignedCents(transaction.amountCents)}
        </p>
      </div>
    </div>
  );
}
