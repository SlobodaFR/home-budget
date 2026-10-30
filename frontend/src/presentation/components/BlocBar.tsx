import { BLOC_INFO } from '../../domain/bloc';
import { BlocFigure, describeBlocGap, fillRatio } from '../../domain/budget';
import { formatCents } from '../../domain/money';
import { BLOC_STYLE } from './bloc-style';

function gapText(figure: BlocFigure): { text: string; tone: string } | null {
  const gap = describeBlocGap(figure);
  switch (gap.kind) {
    case 'over':
      return { text: `Dépassement de ${formatCents(gap.amountCents)}`, tone: 'text-error font-semibold' };
    case 'remaining':
      return { text: `Il reste ${formatCents(gap.amountCents)}`, tone: 'text-mute' };
    case 'shortfall':
      return { text: `Manque ${formatCents(gap.amountCents)}`, tone: 'text-error font-semibold' };
    case 'reached':
      return {
        text: gap.amountCents > 0 ? `Objectif dépassé de ${formatCents(gap.amountCents)}` : 'Objectif atteint',
        tone: 'text-success font-semibold',
      };
    default:
      return null;
  }
}

export function BlocBar({ figure }: { figure: BlocFigure }) {
  const info = BLOC_INFO[figure.bloc];
  const style = BLOC_STYLE[figure.bloc];
  const gap = gapText(figure);
  const overrun = describeBlocGap(figure).kind === 'over';
  const ratio = fillRatio(figure);

  return (
    <li className="py-md">
      <div className="mb-1 flex items-baseline justify-between gap-md">
        <span className="flex items-center gap-sm font-body-md text-body-md font-semibold">
          <span className={`inline-block h-3 w-3 rounded-full ${style.dot}`} aria-hidden="true" />
          {info.label}
        </span>
        <span className="tabular font-body-sm text-body-sm">
          <span className="font-semibold">{formatCents(figure.actualCents)}</span>
          <span className="text-mute"> / {formatCents(figure.plannedCents)}</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${info.label} : réel sur prévu`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        className="h-3 overflow-hidden rounded-full bg-soft-cloud"
      >
        <div className={`h-full rounded-full ${overrun ? 'bg-error' : style.bar}`} style={{ width: `${ratio * 100}%` }} />
      </div>
      {gap && <p className={`mt-1 font-body-sm text-body-sm ${gap.tone}`}>{gap.text}</p>}
    </li>
  );
}
