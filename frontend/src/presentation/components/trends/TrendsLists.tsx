import { formatCentsRounded, formatCentsShort } from '../../../domain/money';
import {
  describeNoRisers,
  describeRiser,
  describeTrend,
  RISERS_RULE,
  Riser,
  TopLabel,
  TREND_EXPLANATION,
  trendDirection,
  TrendDirection,
} from '../../../domain/trends';
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, InfoIcon } from '../Icons';
import { cardClass } from '../ui';

const TREND_STYLE: Record<TrendDirection, { icon: typeof ArrowUpIcon | null; className: string }> = {
  up: { icon: ArrowUpIcon, className: 'bg-plaisir/15 text-ink' },
  down: { icon: ArrowDownIcon, className: 'bg-success/10 text-success' },
  flat: { icon: null, className: 'bg-soft-cloud text-ink' },
  unknown: { icon: null, className: 'bg-soft-cloud text-mute' },
};

export function TrendBadge({ percent }: { percent: number | null }) {
  const direction = trendDirection(percent);
  const style = TREND_STYLE[direction];
  const Icon = style.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-md py-0.5 font-body-sm text-body-sm font-semibold ${style.className}`} data-direction={direction}>
      {Icon && <Icon width={16} height={16} />}
      {describeTrend(percent)}
    </span>
  );
}

/** « Où va l'argent » : les libellés qui pèsent le plus, avec leur moyenne mensuelle et leur tendance écrite. */
export function TopLabelsList({ items }: { items: readonly TopLabel[] }) {
  return (
    <section aria-label="Où va l’argent" className={cardClass}>
      <h3 className="font-label-caps text-label-caps uppercase text-mute">Où va l’argent</h3>
      {items.length === 0 ? (
        <p className="mt-sm font-body-sm text-body-sm text-mute">Aucune dépense enregistrée sur cette période.</p>
      ) : (
        <>
          <ol className="mt-sm divide-y divide-hairline-soft">
            {items.map((item, index) => (
              <li key={`${item.label}-${index}`} className="flex flex-col gap-1 py-md" data-testid="top-label">
                <div className="flex items-baseline justify-between gap-md">
                  <span className="min-w-0 break-words font-body-md text-body-md font-semibold">{item.label}</span>
                  <span className="tabular shrink-0 font-body-md text-body-md font-semibold">{formatCentsShort(item.totalCents)}</span>
                </div>
                <p className="font-body-sm text-body-sm text-mute">
                  Environ {formatCentsRounded(item.monthlyAverageCents)} par mois
                </p>
                <div>
                  <TrendBadge percent={item.trendPercent} />
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-sm font-body-sm text-body-sm text-mute">{TREND_EXPLANATION}</p>
        </>
      )}
    </section>
  );
}

/** « En hausse » : les dépenses dont la moyenne mensuelle grimpe nettement. L'état vide rassure. */
export function RisersSection({ items, monthsCount }: { items: readonly Riser[]; monthsCount: number }) {
  return (
    <section aria-label="Dépenses en hausse" className={cardClass}>
      <h3 className="font-label-caps text-label-caps uppercase text-mute">En hausse</h3>
      {items.length === 0 ? (
        <p className="mt-sm flex items-start gap-sm rounded bg-soft-cloud p-md font-body-sm text-body-sm">
          {monthsCount >= 4 ? <CheckIcon width={18} height={18} className="mt-0.5 shrink-0 text-success" /> : <InfoIcon width={18} height={18} className="mt-0.5 shrink-0" />}
          {describeNoRisers(monthsCount)}
        </p>
      ) : (
        <>
          <ul className="mt-sm divide-y divide-hairline-soft">
            {items.map((item, index) => (
              <li key={`${item.label}-${index}`} className="py-md" data-testid="riser">
                <p className="flex items-center gap-sm font-body-md text-body-md font-semibold">
                  <ArrowUpIcon width={18} height={18} className="shrink-0" />
                  <span className="min-w-0 break-words">{item.label}</span>
                </p>
                <p className="font-body-sm text-body-sm">{describeRiser(item)}</p>
              </li>
            ))}
          </ul>
          <p className="mt-sm font-body-sm text-body-sm text-mute">{RISERS_RULE}</p>
        </>
      )}
    </section>
  );
}
