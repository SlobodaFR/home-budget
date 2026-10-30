import {
  DEBT_RATIO_EXPLANATION,
  DEBT_RATIO_LABEL,
  DEBT_RATIO_REFERENCE_PERCENT,
  debtRatioLevel,
  DebtRatioLevel,
  DebtsSummary,
  describeDebtRatio,
  ratioGaugePercent,
} from '../../../domain/debt';
import { formatCentsShort } from '../../../domain/money';
import { AlertIcon, CheckIcon, InfoIcon } from '../Icons';
import { cardClass } from '../ui';

const LEVEL_STYLE: Record<DebtRatioLevel, { badge: string; bar: string; icon: typeof CheckIcon }> = {
  unknown: { badge: 'bg-soft-cloud text-ink', bar: 'bg-mute', icon: InfoIcon },
  below: { badge: 'bg-success/10 text-success', bar: 'bg-success', icon: CheckIcon },
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
  const referencePosition = ratioGaugePercent(DEBT_RATIO_REFERENCE_PERCENT);

  return (
    <section aria-label="Synthèse des crédits" className={`${cardClass} flex flex-col gap-md`}>
      <dl className="grid grid-cols-2 gap-md">
        <div>
          <dt className="font-label-caps text-label-caps uppercase text-mute">Crédits en cours</dt>
          <dd className="tabular font-heading-lg text-heading-lg">{summary.activeCount}</dd>
        </div>
        <div>
          <dt className="font-label-caps text-label-caps uppercase text-mute">Capital restant</dt>
          <dd className="tabular font-heading-lg text-heading-lg">{formatCentsShort(summary.totalRemainingCents)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="font-label-caps text-label-caps uppercase text-mute">Mensualités totales</dt>
          <dd className="tabular font-heading-lg text-heading-lg">
            {formatCentsShort(summary.totalMonthlyCents)} <span className="font-body-sm text-body-sm font-normal text-mute">par mois, assurances comprises</span>
          </dd>
        </div>
      </dl>

      <div className="border-t border-hairline-soft pt-md">
        <div className="flex flex-wrap items-center justify-between gap-sm">
          <p className="font-label-caps text-label-caps uppercase text-mute">Taux d’endettement</p>
          <span className={`inline-flex items-center gap-1 rounded-full px-md py-0.5 font-body-sm text-body-sm font-semibold ${style.badge}`} data-level={level}>
            <Icon width={16} height={16} />
            {DEBT_RATIO_LABEL[level]}
          </span>
        </div>
        <p className="tabular font-heading-xl text-heading-xl">{percent === null ? '—' : `${percent} %`}</p>
        {percent !== null && (
          <div className="mt-sm">
            <div
              role="progressbar"
              aria-label="Taux d’endettement"
              aria-valuemin={0}
              aria-valuemax={DEBT_RATIO_REFERENCE_PERCENT * 2}
              aria-valuenow={Math.min(percent, DEBT_RATIO_REFERENCE_PERCENT * 2)}
              aria-valuetext={`${percent} % ; repère courant : ${DEBT_RATIO_REFERENCE_PERCENT} %`}
              className="relative h-3 w-full overflow-hidden rounded-full bg-soft-cloud"
            >
              <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${ratioGaugePercent(percent)}%` }} />
              <span className="absolute top-0 h-full w-0.5 bg-ink" style={{ left: `${referencePosition}%` }} aria-hidden="true" data-testid="ratio-marker" />
            </div>
            <p className="mt-1 font-body-sm text-body-sm text-mute">Le trait noir marque le repère de {DEBT_RATIO_REFERENCE_PERCENT} %.</p>
          </div>
        )}
        <p className={`mt-sm font-body-sm text-body-sm font-semibold ${level === 'above' ? 'text-error' : ''}`} data-testid="ratio-text">
          {describeDebtRatio(percent)}
        </p>
        <p className="mt-1 font-body-sm text-body-sm text-mute">{DEBT_RATIO_EXPLANATION}</p>
      </div>
    </section>
  );
}
