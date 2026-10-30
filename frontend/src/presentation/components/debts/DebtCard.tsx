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
} from '../../../domain/debt';
import { formatCentsShort } from '../../../domain/money';
import { AlertIcon, CheckIcon, PencilIcon } from '../Icons';
import { cardClass } from '../ui';
import { DEBT_KIND_ICON } from './debt-style';

interface Props {
  debt: Debt;
  onOpen: (debt: Debt) => void;
  onEdit: (debt: Debt) => void;
}

const actionButton =
  'inline-flex min-h-[44px] items-center justify-center gap-1 rounded-full border border-hairline px-lg font-body-sm text-body-sm font-semibold text-ink hover:bg-soft-cloud';

export function DebtCard({ debt, onOpen, onEdit }: Props) {
  const Icon = DEBT_KIND_ICON[debt.kind];
  const payoff = describePayoff(debt);
  const repaid = isRepaid(debt);
  const progressText = describePaidProgress(debt);

  return (
    <li
      className={`${cardClass} flex flex-col gap-md ${debt.archived ? 'opacity-80' : ''} ${debt.neverPaidOff && !debt.archived ? 'border border-error/50' : ''}`}
      data-testid="debt-card"
      data-never-paid-off={debt.neverPaidOff ? 'true' : undefined}
    >
      <div className="flex items-start gap-md">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-soft-cloud">
          <Icon width={22} height={22} />
          <span className="sr-only">{DEBT_KIND_LABEL[debt.kind]}</span>
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="break-words font-body-md text-body-md font-semibold">{debt.name}</h4>
          <p className="font-body-sm text-body-sm text-mute">
            {DEBT_KIND_LABEL[debt.kind]} · Taux {formatRate(debt.annualRatePercent)}
          </p>
        </div>
      </div>

      {(debt.archived || debt.neverPaidOff || repaid) && (
        <div className="flex flex-wrap items-center gap-sm">
          {debt.neverPaidOff && (
            <span className="inline-flex items-center gap-1 rounded-full bg-error/10 px-md py-0.5 font-body-sm text-body-sm font-semibold text-error">
              <AlertIcon width={16} height={16} />
              {NEVER_PAID_OFF_LABEL}
            </span>
          )}
          {repaid && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-md py-0.5 font-body-sm text-body-sm font-semibold text-success">
              <CheckIcon width={16} height={16} />
              Remboursé
            </span>
          )}
          {debt.archived && <span className="rounded-full bg-soft-cloud px-md py-0.5 font-body-sm text-body-sm font-semibold text-mute">Archivé</span>}
        </div>
      )}

      <div>
        <p className="font-label-caps text-label-caps uppercase text-mute">Capital restant</p>
        <p className="tabular font-heading-lg text-heading-lg">{formatCentsShort(debt.remainingCents)}</p>
      </div>

      <div>
        <div
          role="progressbar"
          aria-label={`Remboursement de ${debt.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={debt.paidSharePercent}
          aria-valuetext={progressText}
          className="h-3 w-full overflow-hidden rounded-full bg-soft-cloud"
        >
          <div className="h-full rounded-full bg-success" style={{ width: `${debt.paidSharePercent}%` }} />
        </div>
        <p className="tabular mt-1 font-body-sm text-body-sm font-semibold">{progressText}</p>
      </div>

      <div className="font-body-sm text-body-sm">
        <p className="font-semibold">{describeMonthly(debt)}</p>
        {!debt.neverPaidOff && payoff && <p className="text-mute">{payoff}</p>}
        {!debt.neverPaidOff && !repaid && debt.totalInterestRemainingCents !== null && (
          <p className="text-mute">Intérêts restant à payer : {formatCentsShort(debt.totalInterestRemainingCents)}</p>
        )}
        {repaid && <p className="text-mute">Il ne reste plus rien à rembourser.</p>}
      </div>

      {debt.neverPaidOff && (
        <p role="alert" className="flex items-start gap-sm rounded border border-error/40 bg-error/5 p-md font-body-sm text-body-sm font-semibold text-error">
          <AlertIcon width={20} height={20} className="mt-0.5 shrink-0" />
          <span>{describeNeverPaidOff(debt)}</span>
        </p>
      )}

      <div className="flex flex-wrap gap-sm">
        <button type="button" onClick={() => onOpen(debt)} aria-label={`Simuler un remboursement de ${debt.name}`} className={`${actionButton} bg-ink text-surface hover:bg-ink`}>
          Et si je remboursais plus vite ?
        </button>
        <button type="button" onClick={() => onEdit(debt)} aria-label={`Modifier ${debt.name}`} className={actionButton}>
          <PencilIcon width={18} height={18} />
          Modifier
        </button>
      </div>
    </li>
  );
}
