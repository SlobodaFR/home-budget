import { useState } from 'react';
import {
  Account,
  ACCOUNT_KIND_INFO,
  DELETE_REFUSED_MESSAGE,
  describeProjection,
  describeTransactionCount,
  goesNegative,
} from '../../../domain/account';
import { formatCents } from '../../../domain/money';
import { formatDateInput } from '../../../domain/month';
import { ApiError } from '../../../infrastructure/api-client';
import { ArchiveIcon, PencilIcon, TrashIcon } from '../Icons';
import { cardClass } from '../ui';

interface Props {
  account: Account;
  busy: boolean;
  onEdit: (account: Account) => void;
  onToggleArchive: (account: Account) => void;
  onDelete: (account: Account) => Promise<void>;
}

const actionButton =
  'inline-flex min-h-[44px] items-center justify-center gap-1 rounded-full border border-hairline px-lg font-body-sm text-body-sm font-semibold text-ink hover:bg-soft-cloud disabled:opacity-40';

function tone(cents: number): string {
  return cents < 0 ? 'text-error' : 'text-ink';
}

export function AccountCard({ account, busy, onEdit, onToggleArchive, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const warning = describeProjection(account);

  const confirmDelete = async () => {
    setDeleteError(null);
    try {
      await onDelete(account);
    } catch (error) {
      setDeleteError(
        error instanceof ApiError && error.status === 400
          ? DELETE_REFUSED_MESSAGE
          : 'Suppression impossible pour le moment, réessayez dans un instant.',
      );
      setConfirming(false);
    }
  };

  return (
    <li className={`${cardClass} flex flex-col gap-md ${account.archived ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-md">
        <div className="min-w-0">
          <h4 className="break-words font-body-md text-body-md font-semibold">{account.name}</h4>
          <p className="font-body-sm text-body-sm text-mute">
            {ACCOUNT_KIND_INFO[account.kind].label} · {describeTransactionCount(account.transactionCount)}
          </p>
        </div>
        {account.archived && (
          <span className="shrink-0 rounded-full bg-soft-cloud px-md py-0.5 font-body-sm text-body-sm font-semibold text-mute">Archivé</span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-md">
        <div>
          <dt className="font-body-sm text-body-sm text-mute">Solde actuel</dt>
          <dd className={`tabular font-heading-lg text-heading-lg ${tone(account.balanceCents)}`}>{formatCents(account.balanceCents)}</dd>
        </div>
        {!account.archived && (
          <div>
            <dt className="font-body-sm text-body-sm text-mute">Fin du mois (estimé)</dt>
            <dd className={`tabular font-heading-lg text-heading-lg ${goesNegative(account) ? 'font-bold text-error' : 'text-ink'}`}>
              {formatCents(account.projectedMonthEndCents)}
            </dd>
          </div>
        )}
      </dl>

      {warning && (
        <p role="alert" className="rounded border border-error/40 bg-error/5 p-md font-body-sm text-body-sm text-error">
          {warning}
        </p>
      )}

      <p className="font-body-sm text-body-sm text-mute">
        Ouvert le {formatDateInput(account.openingDate)} avec {formatCents(account.openingBalanceCents)}.
      </p>

      {deleteError && (
        <p role="alert" className="rounded border border-error/40 bg-error/5 p-md font-body-sm text-body-sm text-error">
          {deleteError}
        </p>
      )}

      {confirming ? (
        <div className="flex items-center justify-between gap-md">
          <p className="font-body-md text-body-md font-semibold">Supprimer ce compte ?</p>
          <div className="flex shrink-0 gap-sm">
            <button type="button" onClick={() => setConfirming(false)} className="min-h-[44px] rounded-full border border-hairline px-lg font-button-md text-body-sm font-semibold">
              Non
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={confirmDelete}
              className="min-h-[44px] rounded-full bg-error px-lg font-button-md text-body-sm font-semibold text-white disabled:opacity-40"
            >
              Supprimer
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-sm">
          <button type="button" onClick={() => onEdit(account)} aria-label={`Modifier ${account.name}`} className={actionButton}>
            <PencilIcon width={18} height={18} />
            Modifier
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onToggleArchive(account)}
            aria-label={`${account.archived ? 'Désarchiver' : 'Archiver'} ${account.name}`}
            className={actionButton}
          >
            <ArchiveIcon width={18} height={18} />
            {account.archived ? 'Désarchiver' : 'Archiver'}
          </button>
          <button
            type="button"
            onClick={() => {
              setDeleteError(null);
              setConfirming(true);
            }}
            aria-label={`Supprimer ${account.name}`}
            className={`${actionButton} text-error`}
          >
            <TrashIcon width={18} height={18} />
            Supprimer
          </button>
        </div>
      )}
    </li>
  );
}
