import { AccountSummary, AccountType } from '../../domain/account';
import { formatCents } from '../../domain/money';

interface AccountCardProps {
  account: AccountSummary;
  onEdit: (account: AccountSummary) => void;
  onDelete: (account: AccountSummary) => void;
}

export function AccountCard({ account, onEdit, onDelete }: AccountCardProps) {
  const isSource = account.type === AccountType.SOURCE;
  const usedRatio =
    account.monthlyBudgetCents && account.monthlyBudgetCents > 0
      ? Math.min(
          1,
          Math.max(0, (account.monthlyBudgetCents - account.balanceCents) / account.monthlyBudgetCents),
        )
      : 0;

  return (
    <div
      className={`relative group bg-soft-cloud p-xl flex flex-col justify-between min-h-[220px] ${
        isSource ? 'border-2 border-ink' : ''
      }`}
    >
      <div className="absolute top-sm right-sm flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          className="material-symbols-outlined text-mute hover:text-ink p-1 text-base"
          onClick={() => onEdit(account)}
          aria-label={`Modifier ${account.name}`}
        >
          edit
        </button>
        <button
          type="button"
          className="material-symbols-outlined text-mute hover:text-error p-1 text-base"
          onClick={() => onDelete(account)}
          aria-label={`Supprimer ${account.name}`}
        >
          delete
        </button>
      </div>

      <div>
        {isSource ? (
          <div className="flex justify-between">
            <span className="material-symbols-outlined text-success mb-md">{account.icon}</span>
            <span className="bg-success text-white px-md py-1 font-label-caps text-[10px] h-fit">
              ENTREES
            </span>
          </div>
        ) : (
          <span className="material-symbols-outlined text-error mb-md">{account.icon}</span>
        )}
        <h4 className="font-label-caps text-label-caps text-mute mb-sm">{account.name}</h4>
        <p className="font-heading-xl text-heading-xl text-ink">{formatCents(account.balanceCents)}</p>
      </div>
      {!isSource && (
        <div className="pt-xl">
          <div className="w-full h-1 bg-hairline-soft mb-sm">
            <div className="h-full bg-error" style={{ width: `${usedRatio * 100}%` }} />
          </div>
          <p className="font-body-sm text-body-sm text-mute">
            Budget : {account.monthlyBudgetCents !== null ? formatCents(account.monthlyBudgetCents) : '-'}
          </p>
        </div>
      )}
    </div>
  );
}
