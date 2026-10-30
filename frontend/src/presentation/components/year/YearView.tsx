import { Link } from 'react-router-dom';
import { formatCents, formatSignedCents } from '../../../domain/money';
import { describePeakSentence, peakMonths, yearBalanceCents, YearForecast } from '../../../domain/year-forecast';
import { cardClass } from '../ui';
import { YearHistogram } from './YearHistogram';
import { YearMonthList } from './YearMonthList';

function Total({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-label-caps text-label-caps uppercase text-mute">{label}</dt>
      <dd className={`tabular font-heading-lg text-heading-lg ${tone ?? 'text-ink'}`}>{value}</dd>
    </div>
  );
}

export function YearView({ forecast }: { forecast: YearForecast }) {
  const peaks = peakMonths(forecast);
  const balance = yearBalanceCents(forecast);

  if (forecast.months.length === 0) {
    return (
      <p className="rounded bg-soft-cloud p-md font-body-md text-body-md">
        Rien à afficher pour {forecast.year} : ajoutez vos paiements récurrents (loyer, salaire, taxe…) pour voir l’année se dessiner.
      </p>
    );
  }

  return (
    <>
      <section aria-label={`Totaux ${forecast.year}`} className={`${cardClass} flex flex-col gap-md`}>
        <dl className="grid grid-cols-1 gap-md min-[420px]:grid-cols-3">
          <Total label="Revenus" value={formatCents(forecast.totalIncomeCents)} />
          <Total label="Dépenses" value={formatCents(forecast.totalExpenseCents)} />
          <Total label="Solde de l’année" value={formatSignedCents(balance)} tone={balance < 0 ? 'text-error' : 'text-ink'} />
        </dl>
        <p className="rounded bg-soft-cloud p-md font-body-sm text-body-sm">{describePeakSentence(peaks)}</p>
        {forecast.provisionHintCents > 0 && (
          <p className="font-body-sm text-body-sm">
            Mettre de côté environ <span className="tabular font-semibold">{formatCents(forecast.provisionHintCents)} par mois</span> lisse les paiements non mensuels.{' '}
            <Link to="/previsionnel?vue=provisions" className="inline-flex min-h-[44px] items-center font-semibold underline">
              Voir mes provisions
            </Link>
          </p>
        )}
        <p className="font-body-sm text-body-sm text-mute">
          Vue calculée à partir de vos paiements récurrents seulement, pas de vos opérations réelles.
        </p>
      </section>
      <YearHistogram forecast={forecast} />
      <YearMonthList forecast={forecast} />
    </>
  );
}
