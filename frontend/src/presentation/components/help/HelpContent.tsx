import { Link } from 'react-router-dom';
import { describeVerification, safeExternalUrl } from '../../../domain/aids';
import { HelpBlock, HelpEntry, HelpLink, HelpSource } from '../../../domain/help';
import { ChevronRightIcon, ExternalLinkIcon, InfoIcon } from '../Icons';

const linkClass = 'inline-flex min-h-[44px] items-center gap-1 font-body-md text-body-md font-semibold text-ink underline';

/** Un lien vers un site extérieur : nouvel onglet, annoncé aux lecteurs d'écran, et seulement en http(s). */
export function ExternalLink({ href, children }: { href: string; children: string }) {
  const safe = safeExternalUrl(href);
  if (!safe) {
    return <span className="font-semibold">{children}</span>;
  }
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer" className={linkClass}>
      <span>{children}</span>
      <ExternalLinkIcon width={14} height={14} className="shrink-0" />
      <span className="sr-only"> (nouvel onglet)</span>
    </a>
  );
}

function Block({ block }: { block: HelpBlock }) {
  if (block.type === 'paragraph') {
    return <p className="font-body-md text-body-md">{block.text}</p>;
  }
  if (block.type === 'note') {
    return (
      <p className="flex items-start gap-sm rounded bg-soft-cloud p-md font-body-sm text-body-sm text-ink">
        <InfoIcon width={20} height={20} className="mt-0.5 shrink-0" />
        <span>{block.text}</span>
      </p>
    );
  }
  const List = block.ordered ? 'ol' : 'ul';
  return (
    <List className={`flex flex-col gap-sm pl-6 font-body-md text-body-md ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
      {block.items.map((item) => (
        <li key={item} className="pl-1">
          {item}
        </li>
      ))}
    </List>
  );
}

export function HelpBlocks({ blocks }: { blocks: readonly HelpBlock[] }) {
  return (
    <div className="flex flex-col gap-md">
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
}

function SourceLine({ source }: { source: HelpSource }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1 font-body-sm text-body-sm text-mute">
      <span>Source :</span>
      {source.url ? <ExternalLink href={source.url}>{source.label}</ExternalLink> : <span className="font-semibold text-ink">{source.label}</span>}
      <span>({source.verifiedOn ? describeVerification(source.verifiedOn) : 'pas de date de vérification : ce n’est pas une règle officielle'})</span>
    </p>
  );
}

function EntryLink({ link }: { link: HelpLink }) {
  if (link.kind === 'external') {
    return <ExternalLink href={link.href}>{link.label}</ExternalLink>;
  }
  return (
    <Link to={link.to} className={linkClass}>
      {link.label}
      <ChevronRightIcon width={16} height={16} className="shrink-0" />
    </Link>
  );
}

/** Le corps d'une entrée : ses blocs, sa source et ses renvois. Les renvois internes sont masqués quand l'utilisateur n'a pas encore de foyer. */
export function EntryBody({ entry, showInternalLinks }: { entry: HelpEntry; showInternalLinks: boolean }) {
  const links = (entry.links ?? []).filter((link) => link.kind === 'external' || showInternalLinks);
  return (
    <div className="flex flex-col gap-md">
      <HelpBlocks blocks={entry.blocks} />
      {entry.source && <SourceLine source={entry.source} />}
      {links.length > 0 && (
        <ul className="flex flex-wrap gap-x-lg">
          {links.map((link) => (
            <li key={link.label}>
              <EntryLink link={link} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
