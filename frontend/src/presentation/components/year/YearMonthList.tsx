import { formatCents, formatSignedCents } from '../../../domain/money';
import { pluralize } from '../../../domain/plural';
import { mainExpenseItems, monthTitle, YearForecast, YearForecastMonth } from '../../../domain/year-forecast';
import { FlagIcon } from '../Icons';
import { cardClass } from '../ui';

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] leading-tight text-mute">{label}</dt>
      <dd className={`tabular font-body-sm text-body-sm font-semibold ${tone ?? 'text-ink'}`}>{value}</dd>
    </div>
  );
}

const tone = (cents: number) => (cents < 0 ? 'text-error' : 'text-ink');

function MonthRow({ month }: { month: YearForecastMonth }) {
  const { shown, hidden } = month.peak ? mainExpenseItems(month) : { shown: [], hidden: 0 };
  return (
    <li
      className={`py-md ${month.peak ? 'my-1 rounded border-2 border-plaisir bg-plaisir/10 px-md' : ''}`}
      data-testid="year-month"
      data-peak={month.peak ? 'true' : 'false'}
    >
      <div className="flex items-center justify-between gap-md">
        <p className="flex min-w-0 flex-wrap items-center gap-x-sm gap-y-1 font-body-md text-body-md font-semibold">
          {monthTitle(month)}
          {month.peak && (
            <span className="inline-flex items-center gap-1 rounded-full bg-ink px-md py-0.5 font-body-sm text-body-sm font-semibold text-surface">
              <FlagIcon width={14} height={14} />
              Mois pic
            </span>
          )}
        </p>
        <p className={`tabular shrink-0 font-body-md text-body-md font-semibold ${tone(month.balanceCents)}`}>
          <span className="sr-only">Solde du mois : </span>
          {formatSignedCents(month.balanceCents)}
        </p>
      </div>
      <dl className="mt-1 grid grid-cols-3 gap-sm">
        <Figure label="Revenus" value={formatCents(month.incomeCents)} />
        <Figure label="Dépenses" value={formatCents(month.expenseCents)} />
        <Figure label="Cumul" value={formatSignedCents(month.cumulativeCents)} tone={tone(month.cumulativeCents)} />
      </dl>
      {shown.length > 0 && (
        <div className="mt-sm">
          <p className="font-body-sm text-body-sm font-semibold">Les plus gros paiements</p>
          <ul className="mt-1 flex flex-col gap-1">
            {shown.map((item, index) => (
              <li key={`${item.recurringId}-${index}`} className="flex items-baseline justify-between gap-md font-body-sm text-body-sm">
                <span className="min-w-0 break-words">{item.label}</span>
                <span className="tabular shrink-0 font-semibold">− {formatCents(item.amountCents)}</span>
              </li>
            ))}
          </ul>
          {hidden > 0 && <p className="mt-1 font-body-sm text-body-sm text-mute">et {pluralize(hidden, 'autre paiement', 'autres paiements')}</p>}
        </div>
      )}
    </li>
  );
}

export function YearMonthList({ forecast }: { forecast: YearForecast }) {
  return (
    <section aria-label="Mois par mois" className={cardClass}>
      <h3 className="font-label-caps text-label-caps uppercase text-mute">Mois par mois</h3>
      <p className="mt-1 font-body-sm text-body-sm text-mute">Le cumul additionne les soldes mois après mois.</p>
      <ul className="mt-sm divide-y divide-hairline-soft">
        {forecast.months.map((month) => (
          <MonthRow key={month.month} month={month} />
        ))}
      </ul>
    </section>
  );
}
