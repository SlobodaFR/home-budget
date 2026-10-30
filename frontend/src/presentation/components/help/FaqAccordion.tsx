import { useEffect, useState } from 'react';
import { HelpEntry } from '../../../domain/help';
import { ChevronDownIcon } from '../Icons';
import { EntryBody } from './HelpContent';

interface Props {
  entries: readonly HelpEntry[];
  showInternalLinks: boolean;
  /** Pendant une recherche, les réponses sont dépliées pour que l'on voie pourquoi elles correspondent. */
  expandAll: boolean;
}

/** Questions et réponses : un bouton `aria-expanded` dans un titre, et la réponse dans une région nommée par la question. */
export function FaqAccordion({ entries, showInternalLinks, expandAll }: Props) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOverrides({});
  }, [expandAll]);

  return (
    <div className="divide-y divide-hairline-soft">
      {entries.map((entry) => {
        const open = overrides[entry.id] ?? expandAll;
        const buttonId = `${entry.id}-question`;
        const panelId = `${entry.id}-reponse`;
        return (
          <div key={entry.id}>
            <h3>
              <button
                type="button"
                id={buttonId}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOverrides((previous) => ({ ...previous, [entry.id]: !open }))}
                className="flex min-h-[56px] w-full items-center justify-between gap-md py-md text-left font-body-md text-body-md font-semibold"
              >
                <span className="min-w-0">{entry.title}</span>
                <ChevronDownIcon width={20} height={20} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
            </h3>
            <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!open} className="pb-md">
              <EntryBody entry={entry} showInternalLinks={showInternalLinks} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
