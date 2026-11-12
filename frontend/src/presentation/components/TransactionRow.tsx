import { useState } from 'react';
import { BLOC_INFO } from '../../domain/bloc';
import { Transaction } from '../../domain/budget';
import { formatCents } from '../../domain/money';
import { formatDay } from '../../domain/month';
import { BLOC_STYLE } from './bloc-style';
import { ClockIcon, TrashIcon } from './Icons';

/**
 * Sur ordinateur, la liste devient un tableau : date, libellé, bloc, compte, montant. La colonne « Compte » n'existe que si le
 * tableau est assez large (requête de conteneur) ; sinon le compte passe sous le libellé, comme sur mobile.
 */
export const ROW_GRID =
  'lg:grid lg:grid-cols-[4.25rem_minmax(0,1fr)_5.5rem_6.5rem] lg:items-center lg:gap-x-3 lg:[@container(min-width:680px)]:grid-cols-[4.25rem_minmax(0,1fr)_5.5rem_9rem_6.5rem]';

interface Props {
  transaction: Transaction;
  /** Nom du compte rattaché : affiché seulement quand l'espace a des comptes. */
  accountName?: string | null;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => Promise<void>;
}

export function TransactionRow({ transaction, accountName = null, onEdit, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const income = transaction.kind === 'INCOME';
  const blocLabel = transaction.bloc ? BLOC_INFO[transaction.bloc].label : 'Revenu';

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await onDelete(transaction);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <li className="flex min-h-[64px] items-center gap-md py-sm transition-colors lg:rounded lg:hover:bg-soft-cloud">
      <span
        className={`h-10 w-1.5 shrink-0 rounded-full ${transaction.bloc ? BLOC_STYLE[transaction.bloc].dot : 'bg-success'}`}
        aria-hidden="true"
      />
      {confirming ? (
        <div className="flex flex-1 items-center justify-between gap-md">
          <p className="font-body-md text-body-md font-semibold">Supprimer ?</p>
          <div className="flex shrink-0 gap-sm">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="min-h-[44px] rounded-full border border-hairline px-lg font-button-md text-body-sm font-semibold"
            >
              Non
            </button>
            <button
              type="button"
              onClick={() => void confirmDelete()}
              disabled={busy}
              className="min-h-[44px] rounded-full bg-error px-lg font-button-md text-body-sm font-semibold text-white disabled:opacity-40"
            >
              Supprimer
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => onEdit(transaction)}
            aria-label={`Modifier ${transaction.label}`}
            className={`flex min-h-[48px] min-w-0 flex-1 cursor-pointer items-center justify-between gap-md text-left ${ROW_GRID}`}
          >
            <span className="min-w-0 lg:contents">
              <span className="block truncate font-body-md text-body-md font-semibold lg:col-start-2 lg:row-start-1">{transaction.label}</span>
              <span className="block font-body-sm text-body-sm text-mute lg:contents">
                <span className="lg:col-start-1 lg:row-start-1">{formatDay(transaction.date)}</span>
                <span className="lg:hidden"> · </span>
                <span className="lg:col-start-3 lg:row-start-1">{blocLabel}</span>
              </span>
              {accountName && <AccountChip name={accountName} className={`lg:col-start-2 lg:row-start-2 lg:mt-0 lg:justify-self-start lg:[@container(min-width:680px)]:col-start-4 lg:[@container(min-width:680px)]:row-start-1`} />}
            </span>
            <span
              className={`tabular shrink-0 font-body-md text-body-md font-semibold lg:col-start-4 lg:row-start-1 lg:text-right lg:[@container(min-width:680px)]:col-start-5 ${
                income ? 'text-success' : 'text-ink'
              }`}
            >
              {income ? '+ ' : '− '}
              {formatCents(transaction.amountCents)}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Supprimer ${transaction.label}`}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-mute hover:bg-soft-cloud hover:text-error lg:hover:bg-white"
          >
            <TrashIcon width={20} height={20} />
          </button>
        </>
      )}
    </li>
  );
}

export function AccountChip({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span
      title={`Compte : ${name}`}
      className={`mt-0.5 inline-flex max-w-full items-center gap-1 rounded-full bg-soft-cloud px-2 py-0.5 font-body-sm text-[12px] leading-tight text-ink ${className}`.trim()}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink" aria-hidden="true" />
      <span className="sr-only">Compte : </span>
      <span className="truncate">{name}</span>
    </span>
  );
}

export function PendingRow({
  label,
  amountCents,
  income,
  accountName = null,
}: {
  label: string;
  amountCents: number;
  income: boolean;
  accountName?: string | null;
}) {
  return (
    <li className={`flex min-h-[64px] items-center gap-md py-sm opacity-80 lg:pl-[18px] lg:pr-[56px] ${ROW_GRID}`}>
      <ClockIcon className="h-5 w-5 shrink-0 text-mute lg:col-start-1 lg:row-start-1" />
      <span className="min-w-0 flex-1 lg:contents">
        <span className="block truncate font-body-md text-body-md font-semibold lg:col-start-2 lg:row-start-1">{label}</span>
        <span className="block font-body-sm text-body-sm text-mute lg:col-start-3 lg:row-start-1 lg:truncate">En attente d’envoi</span>
        {accountName && <AccountChip name={accountName} className={`lg:col-start-2 lg:row-start-2 lg:mt-0 lg:justify-self-start lg:[@container(min-width:680px)]:col-start-4 lg:[@container(min-width:680px)]:row-start-1`} />}
      </span>
      <span className={`tabular shrink-0 font-body-md text-body-md font-semibold lg:col-start-4 lg:row-start-1 lg:text-right lg:[@container(min-width:680px)]:col-start-5`}>
        {income ? '+ ' : '− '}
        {formatCents(amountCents)}
      </span>
    </li>
  );
}
