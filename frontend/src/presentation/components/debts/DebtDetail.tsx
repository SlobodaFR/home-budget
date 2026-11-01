import { useState } from 'react';
import {
  DEBT_KIND_LABEL,
  Debt,
  describeGuarantee,
  describeInsurance,
  describeMonthly,
  describeNeverPaidOff,
  describePaidProgress,
  describePayoff,
  describeTerm,
  formatRate,
  isRepaid,
  NEVER_PAID_OFF_LABEL,
  RATE_TYPE_LABEL,
  rateTypeLabel,
  rateTypeWarning,
  totalMonthlyCents,
} from '../../../domain/debt';
import { formatCentsShort } from '../../../domain/money';
import { formatLongDateInput } from '../../../domain/month';
import { BottomSheet } from '../BottomSheet';
import { AlertIcon, ArchiveIcon, ChevronRightIcon, InfoIcon, PencilIcon, TrashIcon } from '../Icons';
import { PaymentCheckNotice } from './PaymentCheckNotice';
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
  const repaid = isRepaid(debt);
  const warning = rateTypeWarning(debt.rateType);
  const showCost = !debt.neverPaidOff && !repaid && debt.remainingCostCents !== null;
  const showInsuranceCost = showCost && (debt.remainingInsuranceCents ?? 0) > 0;

  return (
    <BottomSheet title={debt.name} onClose={onClose}>
      <div className="flex flex-col gap-lg">
        <div className="flex flex-col gap-sm">
          {(debt.lender !== '' || debt.contractReference !== '') && (
            <p className="break-words font-body-md text-body-md font-semibold" data-testid="debt-lender">
              {debt.lender}
              {debt.lender !== '' && debt.contractReference !== '' ? ' · ' : ''}
              {debt.contractReference !== '' && <span className="font-normal text-mute">Réf. {debt.contractReference}</span>}
            </p>
          )}
          <p className="font-body-sm text-body-sm text-mute">
            {DEBT_KIND_LABEL[debt.kind]} · Taux {formatRate(debt.annualRatePercent)}
            {debt.rateType ? ` (${RATE_TYPE_LABEL[debt.rateType].toLowerCase()})` : ''}
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
              {debt.monthlyInsuranceCents > 0 && (
                <dd className="tabular font-body-sm text-body-sm text-mute">
                  {formatCentsShort(debt.monthlyPaymentCents)} de mensualité + {formatCentsShort(debt.monthlyInsuranceCents)} d’assurance
                </dd>
              )}
            </div>
            {showCost && (
              <div data-testid="remaining-cost">
                <dt className="font-label-caps text-label-caps uppercase text-mute">Coût restant</dt>
                <dd className="tabular font-heading-lg text-heading-lg">{formatCentsShort(debt.remainingCostCents ?? 0)}</dd>
                <dd className="tabular font-body-sm text-body-sm text-mute">
                  {showInsuranceCost
                    ? `Intérêts : ${formatCentsShort(debt.totalInterestRemainingCents ?? 0)} + assurance : ${formatCentsShort(debt.remainingInsuranceCents ?? 0)}`
                    : 'Intérêts restant à payer'}
                </dd>
              </div>
            )}
            {showInsuranceCost && (
              <div data-testid="remaining-insurance">
                <dt className="font-label-caps text-label-caps uppercase text-mute">Assurance restante</dt>
                <dd className="tabular font-heading-lg text-heading-lg">{formatCentsShort(debt.remainingInsuranceCents ?? 0)}</dd>
                <dd className="font-body-sm text-body-sm text-mute">à payer d’ici la fin du crédit</dd>
              </div>
            )}
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

        <section aria-label="Le contrat" className="flex flex-col gap-sm">
          <h3 className="font-label-caps text-label-caps uppercase text-mute">Le contrat</h3>
          <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-x-md gap-y-sm font-body-sm text-body-sm">
            {debt.initialTermMonths !== null && (
              <>
                <dt className="text-mute">Durée initiale</dt>
                <dd className="font-semibold">{describeTerm(debt.initialTermMonths)}</dd>
              </>
            )}
            <dt className="text-mute">Type de taux</dt>
            <dd className="font-semibold">{rateTypeLabel(debt.rateType)}</dd>
            <dt className="text-mute">Assurance</dt>
            <dd className="break-words font-semibold">{describeInsurance(debt)}</dd>
            {debt.feesCents > 0 && (
              <>
                <dt className="text-mute">Frais de dossier</dt>
                <dd className="tabular font-semibold">{formatCentsShort(debt.feesCents)}</dd>
              </>
            )}
            {(debt.guaranteeKind !== 'NONE' || debt.guaranteeCents > 0) && (
              <>
                <dt className="text-mute">Garantie</dt>
                <dd className="font-semibold">{describeGuarantee(debt)}</dd>
              </>
            )}
          </dl>
          {warning && (
            <p className="flex items-start gap-sm rounded border border-plaisir/50 bg-plaisir/10 p-md font-body-sm text-body-sm" data-testid="rate-type-warning">
              <InfoIcon width={18} height={18} className="mt-0.5 shrink-0" />
              {warning}
            </p>
          )}
          {!repaid && <PaymentCheckNotice debt={debt} />}
          {debt.notes.trim() !== '' && (
            <details className="group rounded border border-hairline" data-testid="debt-notes">
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-md px-md font-body-sm text-body-sm font-semibold">
                <span>Notes</span>
                <ChevronRightIcon width={20} height={20} className="transition-transform group-open:rotate-90" />
              </summary>
              <p className="whitespace-pre-wrap break-words px-md pb-md font-body-sm text-body-sm">{debt.notes}</p>
            </details>
          )}
        </section>

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
