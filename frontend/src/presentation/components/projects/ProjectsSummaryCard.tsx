import { Link } from 'react-router-dom';
import { formatCentsShort } from '../../../domain/money';
import { describeSummaryGap, ProjectsSummary } from '../../../domain/project';
import { AlertIcon, CheckIcon } from '../Icons';
import { cardClass } from '../ui';

/** Besoin mensuel de tous les projets comparé à l'épargne prévue au plan. Rien tant qu'aucun projet n'est en cours. */
export function ProjectsSummaryCard({ summary }: { summary: ProjectsSummary }) {
  const line = describeSummaryGap(summary);
  if (!line) {
    return null;
  }
  return (
    <section aria-label="Synthèse des projets" className={`${cardClass} flex flex-col gap-md`}>
      <dl className="grid grid-cols-2 gap-md">
        <div>
          <dt className="font-label-caps text-label-caps uppercase text-mute">Besoin par mois</dt>
          <dd className="tabular font-heading-lg text-heading-lg">{formatCentsShort(summary.totalMonthlyNeededCents)}</dd>
          <dd className="font-body-sm text-body-sm text-mute">pour {summary.activeCount > 1 ? `${summary.activeCount} projets` : '1 projet'}</dd>
        </div>
        <div>
          <dt className="font-label-caps text-label-caps uppercase text-mute">Épargne prévue</dt>
          <dd className="tabular font-heading-lg text-heading-lg">{formatCentsShort(summary.plannedEpargneCents)}</dd>
          <dd className="font-body-sm text-body-sm text-mute">dans votre plan</dd>
        </div>
      </dl>
      {line.gap ? (
        <div className="rounded border border-error/40 bg-error/5 p-md">
          <p role="alert" className="flex items-start gap-sm font-body-md text-body-md font-semibold text-error">
            <AlertIcon width={20} height={20} className="mt-0.5 shrink-0" />
            {line.text}
          </p>
          <Link to="/plan" className="mt-sm inline-flex min-h-[44px] items-center font-body-sm text-body-sm font-semibold underline">
            Ajuster mon plan
          </Link>
        </div>
      ) : (
        <p className="flex items-start gap-sm rounded bg-success/10 p-md font-body-sm text-body-sm font-semibold text-success">
          <CheckIcon width={20} height={20} className="shrink-0" />
          {line.text}
        </p>
      )}
    </section>
  );
}
