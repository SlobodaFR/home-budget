import { Link } from 'react-router-dom';
import { BLOC_INFO } from '../../../domain/bloc';
import {
  ForecastOccurrence,
  missingBanner,
  missingOccurrences,
  OCCURRENCE_STATUS_INFO,
  OccurrenceStatus,
} from '../../../domain/forecast';
import { formatCents } from '../../../domain/money';
import { formatDay } from '../../../domain/month';
import { AlertIcon, CheckIcon, ClockIcon } from '../Icons';
import { BLOC_STYLE } from '../bloc-style';
import { cardClass } from '../ui';

const STATUS_BADGE: Record<OccurrenceStatus, { className: string; Icon: typeof CheckIcon }> = {
  PAID: { className: 'bg-success/10 text-success', Icon: CheckIcon },
  MISSING: { className: 'bg-error/10 text-error', Icon: AlertIcon },
  DUE: { className: 'bg-soft-cloud text-mute', Icon: ClockIcon },
};

function OccurrenceRow({ occurrence }: { occurrence: ForecastOccurrence }) {
  const income = occurrence.kind === 'INCOME';
  const missing = occurrence.status === 'MISSING';
  const badge = STATUS_BADGE[occurrence.status];
  const Icon = badge.Icon;
  const blocLabel = occurrence.bloc ? BLOC_INFO[occurrence.bloc].label : 'Revenu';

  return (
    <li
      className={`flex gap-md py-md ${missing ? 'my-1 rounded border border-error/40 bg-error/5 px-md' : ''}`}
      data-status={occurrence.status}
    >
      <span
        className={`mt-1 h-10 w-1.5 shrink-0 rounded-full ${occurrence.bloc ? BLOC_STYLE[occurrence.bloc].dot : 'bg-success'}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-md">
          <p className="min-w-0 break-words font-body-md text-body-md font-semibold">{occurrence.label}</p>
          <p className={`tabular shrink-0 font-body-md text-body-md font-semibold ${income ? 'text-success' : 'text-ink'}`}>
            {income ? '+ ' : '− '}
            {formatCents(occurrence.amountCents)}
          </p>
        </div>
        <p className="font-body-sm text-body-sm text-mute">
          {occurrence.estimated ? 'Vers le ' : 'Le '}
          {formatDay(occurrence.date)}
          {occurrence.estimated ? ' (date estimée)' : ''} · {blocLabel}
        </p>
        <p className={`mt-1 inline-flex items-center gap-1 rounded-full px-md py-0.5 font-body-sm text-body-sm font-semibold ${badge.className}`}>
          <Icon width={16} height={16} />
          {OCCURRENCE_STATUS_INFO[occurrence.status].label}
        </p>
        {missing && (
          <p className="mt-sm font-body-sm text-body-sm">
            Attendu mais non retrouvé —{' '}
            <Link to="/import" className="font-semibold underline">
              importez votre relevé
            </Link>
          </p>
        )}
      </div>
    </li>
  );
}

export function ForecastOccurrences({ occurrences }: { occurrences: ForecastOccurrence[] }) {
  const missing = missingOccurrences({ occurrences });
  return (
    <section aria-label="Paiements attendus ce mois-ci" className={cardClass}>
      <h3 className="font-label-caps text-label-caps uppercase text-mute">Paiements attendus ce mois-ci</h3>
      {missing.length > 0 && (
        <div role="status" className="mt-md rounded border border-error/40 bg-error/5 p-md font-body-sm text-body-sm">
          <p className="font-semibold text-error">{missingBanner(missing.length)}</p>
          <p>
            Votre relevé n’est peut-être pas encore importé.{' '}
            <Link to="/import" className="inline-flex min-h-[44px] items-center font-semibold underline">
              Importer mon relevé
            </Link>
          </p>
        </div>
      )}
      {occurrences.length === 0 ? (
        <p className="mt-md font-body-sm text-body-sm text-mute">
          Aucun paiement récurrent n’est prévu ce mois-ci. Ajoutez votre loyer, vos abonnements ou votre salaire plus bas pour affiner la prévision.
        </p>
      ) : (
        <ul className="mt-sm divide-y divide-hairline-soft">
          {occurrences.map((occurrence, index) => (
            <OccurrenceRow key={`${occurrence.recurringId}-${occurrence.date}-${index}`} occurrence={occurrence} />
          ))}
        </ul>
      )}
    </section>
  );
}
