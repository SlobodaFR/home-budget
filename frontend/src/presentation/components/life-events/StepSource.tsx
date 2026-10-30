import { safeExternalUrl } from '../../../domain/aids';
import { describeSourceVerification, LifeEventStep } from '../../../domain/life-event';
import { ExternalLinkIcon } from '../Icons';

/**
 * « Source : service-public.gouv.fr (vérifié le 30 octobre 2026) ». Le lien s'ouvre dans un nouvel onglet et seulement
 * si l'adresse est en http(s) ; sinon le nom de la source reste affiché, sans lien.
 */
export function StepSource({ step }: { step: Pick<LifeEventStep, 'sourceLabel' | 'sourceUrl' | 'verifiedOn'> }) {
  const href = safeExternalUrl(step.sourceUrl);
  const label = step.sourceLabel.trim() === '' ? 'source officielle' : step.sourceLabel;
  const verification = describeSourceVerification(step);
  return (
    <p className="font-body-sm text-body-sm text-mute">
      Source :{' '}
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-1 font-semibold text-ink underline">
          {label}
          <ExternalLinkIcon width={14} height={14} />
          <span className="sr-only"> (s’ouvre dans un nouvel onglet)</span>
        </a>
      ) : (
        <span className="font-semibold text-ink">{label}</span>
      )}
      {verification && <> ({verification})</>}
    </p>
  );
}
