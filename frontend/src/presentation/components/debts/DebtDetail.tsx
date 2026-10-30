import { useState } from 'react';
import {
  DEBT_KIND_LABEL,
  Debt,
  describeMonthly,
  describeNeverPaidOff,
  describePaidProgress,
  describePayoff,
  formatRate,
  isRepaid,
  NEVER_PAID_OFF_LABEL,
  totalMonthlyCents,
} from '../../../domain/debt';
import { formatCentsShort } from '../../../domain/money';
import { formatLongDateInput } from '../../../domain/month';
import { BottomSheet } from '../BottomSheet';
import { AlertIcon, ArchiveIcon, PencilIcon, TrashIcon } from '../Icons';
import { WhatIfSimulator } from './WhatIfSimulator';

interface Props {
  debt: Debt;
  spaceId: string;
  busy: boolean;
  onClose: () => void;
  onEdit: (debt: Debt) => void;
  onToggleArchive: (debt: Debt) => void;
  onDelete: (debt: Debt) => Promise<void>;
}

const actionButton =
  'inline-flex min-h-[44px] items-center justify-center gap-1 rounded-full border border-hairline px-lg font-body-sm text-body-sm font-semibold text-ink hover:bg-soft-cloud disabled:opacity-40';

export function DebtDetail({ debt, spaceId, busy, onClose, onEdit, onToggleArchive, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false);
  const payoff = describePayoff(debt);

  return (
    <BottomSheet title={debt.name} onClose={onClose}>
      <div className="flex flex-col gap-lg">
        <div className="flex flex-col gap-sm">
          <p className="font-body-sm text-body-sm text-mute">
            {DEBT_KIND_LABEL[debt.kind]} · Taux {formatRate(debt.annualRatePercent)}
            {debt.archived ? ' · Archivé' : ''}
          </p>
          <dl className="grid grid-cols-2 gap-md">
            <div>
              <dt className="font-label-caps text-label-caps uppercase text-mute">Capital restant</dt>
              <dd className="tabular font-heading-lg text-heading-lg">{formatCentsShort(debt.remainingCents)}</dd>
            </div>
            <div>
              <dt className="font-label-caps text-label-caps uppercase text-mute">Prélevé chaque mois</dt>
              <dd className="tabular font-heading-lg text-heading-lg">{formatCentsShort(totalMonthlyCents(debt))}</dd>
            </div>
          </dl>
          <p className="font-body-sm text-body-sm font-semibold">{describePaidProgress(debt)}</p>
          <p className="font-body-sm text-body-sm">
            {describeMonthly(debt)}, le {debt.paymentDay} du mois.
          </p>
          {debt.startDate !== '' && <p className="font-body-sm text-body-sm text-mute">Crédit commencé le {formatLongDateInput(debt.startDate)}.</p>}
          {!debt.neverPaidOff && payoff && <p className="font-body-sm text-body-sm text-mute">{payoff}</p>}
          {debt.neverPaidOff && (
            <p role="alert" className="flex items-start gap-sm rounded border border-error/40 bg-error/5 p-md font-body-sm text-body-sm font-semibold text-error">
              <AlertIcon width={20} height={20} className="mt-0.5 shrink-0" />
              <span>
                <span className="block">{NEVER_PAID_OFF_LABEL}</span>
                <span className="block font-normal">{describeNeverPaidOff(debt)}</span>
              </span>
            </p>
          )}
        </div>

        {isRepaid(debt) ? (
          <p className="rounded bg-soft-cloud p-md font-body-sm text-body-sm">Ce crédit est entièrement remboursé : il n’y a rien à simuler.</p>
        ) : (
          <WhatIfSimulator spaceId={spaceId} debt={debt} />
        )}

        {confirming ? (
          <div className="flex flex-col gap-sm rounded border border-error/40 bg-error/5 p-md">
            <p className="font-body-md text-body-md font-semibold">Supprimer ce crédit ?</p>
            <p className="font-body-sm text-body-sm text-mute">Pour le garder dans l’historique sans qu’il compte dans vos mensualités, archivez-le plutôt.</p>
            <div className="flex gap-sm">
              <button type="button" onClick={() => setConfirming(false)} className="min-h-[44px] rounded-full border border-hairline bg-white px-lg font-button-md text-body-sm font-semibold">
                Non
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onDelete(debt)}
                className="min-h-[44px] rounded-full bg-error px-lg font-button-md text-body-sm font-semibold text-white disabled:opacity-40"
              >
                Supprimer le crédit
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-sm">
            <button type="button" onClick={() => onEdit(debt)} className={actionButton}>
              <PencilIcon width={18} height={18} />
              Modifier
            </button>
            <button type="button" disabled={busy} onClick={() => onToggleArchive(debt)} className={actionButton}>
              <ArchiveIcon width={18} height={18} />
              {debt.archived ? 'Désarchiver' : 'Archiver'}
            </button>
            <button type="button" onClick={() => setConfirming(true)} className={`${actionButton} text-error`}>
              <TrashIcon width={18} height={18} />
              Supprimer le crédit
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
