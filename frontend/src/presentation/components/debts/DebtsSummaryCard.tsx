import {
  DEBT_RATIO_EXPLANATION,
  DEBT_RATIO_LABEL,
  DEBT_RATIO_REFERENCE_PERCENT,
  debtRatioLevel,
  DebtRatioLevel,
  DebtsSummary,
  describeDebtRatio,
  lenderLabel,
  ratioGaugePercent,
} from '../../../domain/debt';
import { formatCentsShort } from '../../../domain/money';
import { AlertIcon, CheckIcon, InfoIcon } from '../Icons';
import { cardClass } from '../ui';

const LEVEL_STYLE: Record<
  DebtRatioLevel,
  { badge: string; bar: string; icon: typeof CheckIcon }
> = {
  unknown: { badge: 'bg-soft-cloud text-ink', bar: 'bg-mute', icon: InfoIcon },
  below: {
    badge: 'bg-success/10 text-success',
    bar: 'bg-success',
    icon: CheckIcon,
  },
  at: { badge: 'bg-plaisir/15 text-ink', bar: 'bg-plaisir', icon: InfoIcon },
  above: { badge: 'bg-error/10 text-error', bar: 'bg-error', icon: AlertIcon },
};

/** Bilan de tous les crédits en cours. Rien tant qu'aucun crédit n'est actif. */
export function DebtsSummaryCard({ summary }: { summary: DebtsSummary }) {
  if (summary.activeCount <= 0) {
    return null;
  }
  const percent = summary.debtToIncomePercent;
  const level = debtRatioLevel(percent);
  const style = LEVEL_STYLE[level];
  const Icon = style.icon;
  // Un seul groupe « Prêteur non précisé » n'apprend rien : on n'affiche le bloc que s'il y a au moins un prêteur nommé.
  const showLenders = summary.byLender.some((entry) => entry.lender !== '');
  const referencePosition = ratioGaugePercent(DEBT_RATIO_REFERENCE_PERCENT);

  return (
    <section
      aria-label="Synthèse des crédits"
      className={`${cardClass} flex flex-col gap-md lg:grid lg:grid-cols-2 lg:gap-x-10`}
    >
      <dl className="grid grid-cols-2 gap-md lg:col-start-1 lg:row-start-1">
        <div>
          <dt className="font-label-caps text-label-caps uppercase text-mute">
            Crédits en cours
          </dt>
          <dd className="tabular font-heading-lg text-heading-lg">
            {summary.activeCount}
          </dd>
        </div>
        <div>
          <dt className="font-label-caps text-label-caps uppercase text-mute">
            Capital restant
          </dt>
          <dd className="tabular font-heading-lg text-heading-lg">
            {formatCentsShort(summary.totalRemainingCents)}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="font-label-caps text-label-caps uppercase text-mute">
            Mensualités totales
          </dt>
          <dd className="tabular font-heading-lg text-heading-lg">
            {formatCentsShort(summary.totalMonthlyCents)}{' '}
            <span className="font-body-sm text-body-sm font-normal text-mute">
              par mois, assurances comprises
            </span>
          </dd>
        </div>
        {summary.totalMonthlyInsuranceCents > 0 && (
          <div>
            <dt className="font-label-caps text-label-caps uppercase text-mute">
              Dont assurances
            </dt>
            <dd
              className="tabular font-heading-lg text-heading-lg"
              data-testid="summary-insurance"
            >
              {formatCentsShort(summary.totalMonthlyInsuranceCents)}
            </dd>
            <dd className="font-body-sm text-body-sm text-mute">par mois</dd>
          </div>
        )}
        {summary.totalRemainingCostCents !== null && (
          <div
            className={
              summary.totalMonthlyInsuranceCents > 0 ? '' : 'col-span-2'
            }
          >
            <dt className="font-label-caps text-label-caps uppercase text-mute">
              Coût restant total
            </dt>
            <dd
              className="tabular font-heading-lg text-heading-lg"
              data-testid="summary-remaining-cost"
            >
              {formatCentsShort(summary.totalRemainingCostCents)}
            </dd>
            <dd className="font-body-sm text-body-sm text-mute">
              intérêts et assurances à payer d’ici la fin
            </dd>
          </div>
        )}
      </dl>

      {showLenders && (
        <div className="border-t border-hairline-soft pt-md lg:col-start-1 lg:row-start-2">
          <h3 className="font-label-caps text-label-caps uppercase text-mute">
            Par prêteur
          </h3>
          <ul
            aria-label="Crédits par prêteur"
            className="mt-sm flex flex-col divide-y divide-hairline-soft"
          >
            {summary.byLender.map((entry) => (
              <li
                key={entry.lender || 'none'}
                className="flex flex-col gap-0.5 py-sm first:pt-0 last:pb-0"
                data-testid="lender-row"
              >
                <p className="break-words font-body-md text-body-md font-semibold">
                  {lenderLabel(entry.lender)}
                </p>
                <p className="tabular font-body-sm text-body-sm">
                  {entry.activeCount > 1
                    ? `${entry.activeCount} crédits en cours`
                    : `${entry.activeCount} crédit en cours`}{' '}
                  · Capital restant {formatCentsShort(entry.remainingCents)} ·{' '}
                  {formatCentsShort(entry.monthlyTotalCents)} par mois
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-hairline-soft pt-md lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
        <div className="flex flex-wrap items-center justify-between gap-sm">
          <p className="font-label-caps text-label-caps uppercase text-mute">
            Taux d’endettement
          </p>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-md py-0.5 font-body-sm text-body-sm font-semibold ${style.badge}`}
            data-level={level}
          >
            <Icon width={16} height={16} />
            {DEBT_RATIO_LABEL[level]}
          </span>
        </div>
        <p className="tabular font-heading-xl text-heading-xl">
          {percent === null ? '—' : `${percent} %`}
        </p>
        {percent !== null && (
          <div className="mt-sm">
            <div
              role="progressbar"
              aria-label="Taux d’endettement"
              aria-valuemin={0}
              aria-valuemax={DEBT_RATIO_REFERENCE_PERCENT * 2}
              aria-valuenow={Math.min(
                percent,
                DEBT_RATIO_REFERENCE_PERCENT * 2,
              )}
              aria-valuetext={`${percent} % ; repère courant : ${DEBT_RATIO_REFERENCE_PERCENT} %`}
              className="relative h-3 w-full overflow-hidden rounded-full bg-soft-cloud"
            >
              <div
                className={`h-full rounded-full ${style.bar}`}
                style={{ width: `${ratioGaugePercent(percent)}%` }}
              />
              <span
                className="absolute top-0 h-full w-0.5 bg-ink"
                style={{ left: `${referencePosition}%` }}
                aria-hidden="true"
                data-testid="ratio-marker"
              />
            </div>
            <p className="mt-1 font-body-sm text-body-sm text-mute">
              Le trait noir marque le repère de {DEBT_RATIO_REFERENCE_PERCENT}{' '}
              %.
            </p>
          </div>
        )}
        <p
          className={`mt-sm font-body-sm text-body-sm font-semibold ${level === 'above' ? 'text-error' : ''}`}
          data-testid="ratio-text"
        >
          {describeDebtRatio(percent)}
        </p>
        <p className="mt-1 font-body-sm text-body-sm text-mute">
          {DEBT_RATIO_EXPLANATION}
        </p>
      </div>
    </section>
  );
}
