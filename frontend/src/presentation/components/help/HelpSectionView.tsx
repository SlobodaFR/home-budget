import { HelpSourcesStatus } from '../../../application/use-help-sources';
import { groupEntries, HelpEntry, helpAnchor, HelpSection } from '../../../domain/help';
import { InfoIcon, WifiOffIcon } from '../Icons';
import { cardClass, buttonSecondary } from '../ui';
import { FaqAccordion } from './FaqAccordion';
import { EntryBody } from './HelpContent';

interface Props {
  section: HelpSection;
  showInternalLinks: boolean;
  searching: boolean;
  sourcesStatus: HelpSourcesStatus;
  onReloadSources: () => void;
}

function Articles({ entries, showInternalLinks, grouped }: { entries: readonly HelpEntry[]; showInternalLinks: boolean; grouped: boolean }) {
  const Heading = grouped ? 'h4' : 'h3';
  return (
    <div className="flex flex-col divide-y divide-hairline-soft">
      {entries.map((entry) => (
        <article key={entry.id} aria-labelledby={`${entry.id}-titre`} className="flex flex-col gap-md py-lg first:pt-0 last:pb-0">
          <Heading id={`${entry.id}-titre`} className="font-body-md text-body-md font-bold">
            {entry.title}
          </Heading>
          <EntryBody entry={entry} showInternalLinks={showInternalLinks} />
        </article>
      ))}
    </div>
  );
}

/** Les articles, avec un sous-titre par groupe quand les entrées en ont. */
function GroupedArticles({ entries, showInternalLinks }: { entries: readonly HelpEntry[]; showInternalLinks: boolean }) {
  const groups = groupEntries(entries);
  const grouped = groups.some((group) => group.title !== null);
  if (!grouped) {
    return <Articles entries={entries} showInternalLinks={showInternalLinks} grouped={false} />;
  }
  return (
    <div className="flex flex-col gap-xl">
      {groups.map((group) => (
        <div key={group.title ?? 'autres'} className="flex flex-col gap-md">
          {group.title && <h3 className="font-label-caps text-label-caps uppercase text-mute">{group.title}</h3>}
          <Articles entries={group.entries} showInternalLinks={showInternalLinks} grouped />
        </div>
      ))}
    </div>
  );
}

function SourcesStatus({ status, onReload }: { status: HelpSourcesStatus; onReload: () => void }) {
  if (status === 'loading') {
    return (
      <p role="status" className="font-body-sm text-body-sm text-mute">
        Chargement des règles à jour…
      </p>
    );
  }
  if (status === 'ready') {
    return null;
  }
  const offline = status === 'offline';
  const Icon = offline ? WifiOffIcon : InfoIcon;
  return (
    <div role="status" className="flex flex-col items-start gap-md rounded bg-soft-cloud p-md">
      <p className="flex items-start gap-sm font-body-sm text-body-sm text-ink">
        <Icon width={20} height={20} className="mt-0.5 shrink-0" />
        <span>
          {offline
            ? 'Vous êtes hors ligne : les crédits d’impôt et les démarches de naissance mis à jour reviendront avec le réseau. Le reste de cette aide reste lisible.'
            : 'Les crédits d’impôt et les démarches de naissance mis à jour ne sont pas disponibles pour le moment. Le reste de cette aide fonctionne normalement.'}
        </span>
      </p>
      <button type="button" onClick={onReload} className={`${buttonSecondary} min-h-[44px] bg-white`}>
        Réessayer
      </button>
    </div>
  );
}

/**
 * Une section de l'aide : titre (h2), résumé, puis son contenu selon sa nature (articles, règles, questions).
 * `relative` : le texte réservé aux lecteurs d'écran (« nouvel onglet ») est positionné dans la section, donc défile avec elle ;
 * sans cela il s'ancre hors de la zone de défilement et rend toute la page défilable.
 */
export function HelpSectionView({ section, showInternalLinks, searching, sourcesStatus, onReloadSources }: Props) {
  const anchor = helpAnchor(section.id);
  return (
    <section id={anchor} aria-labelledby={`${anchor}-titre`} className={`${cardClass} relative flex scroll-mt-md flex-col gap-lg`}>
      <header className="flex flex-col gap-sm">
        <h2 id={`${anchor}-titre`} className="font-heading-lg text-heading-lg">
          {section.title}
        </h2>
        <p className="font-body-sm text-body-sm text-mute">{section.summary}</p>
      </header>

      {section.disclaimer && (
        <p className="flex items-start gap-sm rounded bg-soft-cloud p-md font-body-sm text-body-sm font-semibold text-ink">
          <InfoIcon width={20} height={20} className="mt-0.5 shrink-0" />
          <span>{section.disclaimer}</span>
        </p>
      )}

      {section.kind === 'sources' && <SourcesStatus status={sourcesStatus} onReload={onReloadSources} />}

      {section.kind === 'faq' ? (
        <FaqAccordion entries={section.entries} showInternalLinks={showInternalLinks} expandAll={searching} />
      ) : (
        <GroupedArticles entries={section.entries} showInternalLinks={showInternalLinks} />
      )}

      <a href="#sommaire" className="-mb-2 inline-flex min-h-[44px] items-center self-start font-body-sm text-body-sm font-semibold text-ink underline">
        Retour au sommaire
      </a>
    </section>
  );
}
