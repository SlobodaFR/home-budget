import { formatCents } from '../../../domain/money';
import { monthShortName } from '../../../domain/month';
import {
  averageExpenseCents,
  barHeightPercent,
  describeHistogram,
  maxExpenseCents,
  monthNumber,
  YearForecast,
} from '../../../domain/year-forecast';
import { cardClass } from '../ui';

const BAR_AREA_PX = 112;

/** Hachures + contour : un mois pic se reconnaît sans la couleur. */
const PEAK_FILL = 'repeating-linear-gradient(45deg, #b7791f 0 4px, #f4d9a8 4px 8px)';

const INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

/**
 * Petit histogramme en CSS : une barre par mois (dépenses prévues). Le détail est dans le texte alternatif et la liste
 * des mois juste dessous ; les barres elles-mêmes sont décoratives.
 */
export function YearHistogram({ forecast }: { forecast: YearForecast }) {
  const max = maxExpenseCents(forecast);
  const average = averageExpenseCents(forecast);
  return (
    <figure aria-label="Dépenses prévues par mois" className={`${cardClass} flex flex-col gap-sm`}>
      <figcaption className="font-label-caps text-label-caps uppercase text-mute">Dépenses prévues, mois par mois</figcaption>
      <div role="img" aria-label={describeHistogram(forecast)}>
        <div className="grid grid-cols-12 gap-1" aria-hidden="true">
          {forecast.months.map((month) => {
            const height = barHeightPercent(month.expenseCents, max);
            return (
              <div key={month.month} className="flex flex-col items-center gap-1" data-testid="year-bar" data-peak={month.peak ? 'true' : 'false'}>
                <div className="flex w-full items-end justify-center border-b border-hairline" style={{ height: BAR_AREA_PX }}>
                  <div
                    className={`w-full rounded-t-sm ${month.peak ? 'border-2 border-ink' : 'bg-fixe'}`}
                    style={{ height: `${height}%`, backgroundImage: month.peak ? PEAK_FILL : undefined }}
                  />
                </div>
                <span className={`text-[12px] leading-none ${month.peak ? 'font-bold text-ink' : 'text-mute'}`}>
                  {INITIALS[monthNumber(month) - 1] ?? monthShortName(monthNumber(month))}
                </span>
                <span className="h-3 text-[10px] font-bold leading-none text-ink">{month.peak ? '▲' : ''}</span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="font-body-sm text-body-sm text-mute">
        <span className="mr-1 inline-block h-3 w-3 rounded-sm align-middle" style={{ backgroundImage: PEAK_FILL, border: '1px solid #111' }} aria-hidden="true" />
        Barre rayée avec ▲ : mois « pic », nettement plus cher que la moyenne ({formatCents(average)} par mois).
      </p>
    </figure>
  );
}
