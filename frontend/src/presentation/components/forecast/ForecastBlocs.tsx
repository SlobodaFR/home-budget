import { Bloc, BLOC_INFO } from '../../../domain/bloc';
import { Forecast, ForecastFigure, orderedBlocs, projectionNote } from '../../../domain/forecast';
import { formatCents } from '../../../domain/money';
import { BLOC_STYLE } from '../bloc-style';
import { cardClass } from '../ui';

function Figures({ figure }: { figure: ForecastFigure }) {
  const cells: { label: string; cents: number; strong?: boolean }[] = [
    { label: 'Prévu', cents: figure.plannedCents },
    { label: 'Réel', cents: figure.actualCents },
    { label: 'Restant attendu', cents: figure.expectedRemainingCents },
    { label: 'Projeté', cents: figure.projectedCents, strong: true },
  ];
  return (
    <dl className="mt-sm grid grid-cols-2 gap-x-md gap-y-sm sm:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.label}>
          <dt className="font-body-sm text-body-sm text-mute">{cell.label}</dt>
          <dd className={`tabular font-body-md text-body-md ${cell.strong ? 'font-bold' : 'font-semibold'}`}>{formatCents(cell.cents)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Note({ bloc, figure }: { bloc: Bloc; figure: ForecastFigure }) {
  const note = projectionNote(bloc, figure);
  if (note.status === 'over') {
    return <p className="mt-sm font-body-sm text-body-sm font-semibold text-error">Dépasserait le prévu de {formatCents(note.amountCents)}</p>;
  }
  if (note.status === 'behind') {
    return <p className="mt-sm font-body-sm text-body-sm font-semibold text-plaisir">{formatCents(note.amountCents)} sous l’objectif d’épargne</p>;
  }
  return null;
}

export function ForecastBlocs({ forecast }: { forecast: Forecast }) {
  return (
    <section aria-label="Prévu, réel et projeté" className={cardClass}>
      <h3 className="font-label-caps text-label-caps uppercase text-mute">Revenus et blocs</h3>
      <ul className="mt-sm divide-y divide-hairline-soft">
        <li className="py-md">
          <p className="flex items-center gap-sm font-body-md text-body-md font-semibold">
            <span className="inline-block h-3 w-3 rounded-full bg-success" aria-hidden="true" />
            Revenus
          </p>
          <Figures figure={forecast.income} />
        </li>
        {orderedBlocs(forecast.blocs).map((figure) => (
          <li key={figure.bloc} className="py-md">
            <p className="flex items-center gap-sm font-body-md text-body-md font-semibold">
              <span className={`inline-block h-3 w-3 rounded-full ${BLOC_STYLE[figure.bloc].dot}`} aria-hidden="true" />
              {BLOC_INFO[figure.bloc].label}
            </p>
            <Figures figure={figure} />
            <Note bloc={figure.bloc} figure={figure} />
          </li>
        ))}
      </ul>
    </section>
  );
}
