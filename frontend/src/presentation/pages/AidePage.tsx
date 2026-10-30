import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useHelpSources } from '../../application/use-help-sources';
import { useHousehold } from '../../application/use-household';
import { HELP_SECTIONS } from '../../content/help';
import { countEntries, filterSections, isSearching, withLiveSources } from '../../domain/help';
import { pluralize } from '../../domain/plural';
import { HelpSearch } from '../components/help/HelpSearch';
import { HelpSectionView } from '../components/help/HelpSectionView';
import { HelpToc } from '../components/help/HelpToc';
import { buttonSecondary } from '../components/ui';
import { ChevronLeftIcon, InfoIcon } from '../components/Icons';

/**
 * « Aide et documentation » : tout le contenu est embarqué dans l'application (lisible hors ligne, avec ou sans foyer).
 * Seules les règles officielles (crédits d'impôt, démarches de naissance) viennent du serveur, en complément.
 * Le titre de page (h1) est porté par la mise en page, dans le foyer comme hors du foyer : ici, on commence aux h2.
 */
export function AidePage() {
  const { household } = useHousehold();
  const sources = useHelpSources();
  const [query, setQuery] = useState('');

  const hasHousehold = household !== null;
  const searching = isSearching(query);
  const sections = useMemo(() => withLiveSources(HELP_SECTIONS, sources.entries), [sources.entries]);
  const visible = useMemo(() => filterSections(sections, query), [sections, query]);
  const found = countEntries(visible);

  return (
    <>
      <div>
        <Link
          to={hasHousehold ? '/foyer' : '/bienvenue'}
          className="-ml-2 inline-flex min-h-[44px] items-center gap-1 px-2 font-body-sm text-body-sm font-semibold"
        >
          <ChevronLeftIcon width={18} height={18} />
          {hasHousehold ? 'Foyer' : 'Bienvenue'}
        </Link>
        <p className="font-body-md text-body-md">
          Tout pour bien se servir de l’application, expliqué simplement. Rien à installer de plus : cette aide est incluse dans l’application, vous pouvez la lire sans réseau.
        </p>
        {!hasHousehold && (
          <p className="mt-sm flex items-start gap-sm rounded bg-soft-cloud p-md font-body-sm text-body-sm text-ink">
            <InfoIcon width={20} height={20} className="mt-0.5 shrink-0" />
            <span>Vous n’avez pas encore de foyer : les liens vers les écrans de l’application apparaîtront dès que vous en aurez un.</span>
          </p>
        )}
      </div>

      <HelpSearch query={query} onChange={setQuery} />

      <p role="status" className="-mt-sm font-body-sm text-body-sm text-mute">
        {searching
          ? visible.length === 0
            ? `Aucun résultat pour « ${query.trim()} ».`
            : `${pluralize(found, 'résultat', 'résultats')} dans ${pluralize(visible.length, 'rubrique', 'rubriques')}.`
          : ''}
      </p>

      {visible.length === 0 ? (
        <div className="flex flex-col items-start gap-md rounded bg-soft-cloud p-gutter">
          <p className="font-body-md text-body-md">
            Aucun résultat. Essayez un mot plus court (par exemple « crèche », « import » ou « chiffrement »), ou parcourez le sommaire.
          </p>
          <button type="button" onClick={() => setQuery('')} className={`${buttonSecondary} bg-white`}>
            Voir toute l’aide
          </button>
        </div>
      ) : (
        <>
          <HelpToc sections={visible} />
          {visible.map((section) => (
            <HelpSectionView
              key={section.id}
              section={section}
              showInternalLinks={hasHousehold}
              searching={searching}
              sourcesStatus={sources.status}
              onReloadSources={sources.reload}
            />
          ))}
        </>
      )}
    </>
  );
}
