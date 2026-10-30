import { FormEvent } from 'react';
import { CloseIcon, SearchIcon } from '../Icons';
import { inputClass, labelClass } from '../ui';

interface Props {
  query: string;
  onChange: (query: string) => void;
}

/** Recherche par mot-clé : le filtre se fait au fil de la frappe, sans bouton à valider. */
export function HelpSearch({ query, onChange }: Props) {
  return (
    <form role="search" aria-label="Rechercher dans l’aide" onSubmit={(event: FormEvent) => event.preventDefault()}>
      <label htmlFor="help-search" className={labelClass}>
        Rechercher dans l’aide
      </label>
      <div className="relative">
        <SearchIcon width={20} height={20} className="pointer-events-none absolute left-gutter top-1/2 -translate-y-1/2 text-mute" />
        <input
          id="help-search"
          type="search"
          value={query}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Ex. : import, crèche…"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="search"
          className={`${inputClass} pl-11 pr-12 [&::-webkit-search-cancel-button]:hidden`}
        />
        {query !== '' && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Effacer la recherche"
            className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full"
          >
            <CloseIcon width={20} height={20} />
          </button>
        )}
      </div>
    </form>
  );
}
