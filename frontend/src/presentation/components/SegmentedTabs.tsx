import { KeyboardEvent, useRef } from 'react';

export interface TabOption<T extends string> {
  id: T;
  label: string;
}

interface Props<T extends string> {
  label: string;
  /** Préfixe des identifiants : l'onglet `x` a l'id `{idPrefix}-tab-x` et pilote `{idPrefix}-panel-x`. */
  idPrefix: string;
  options: readonly TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export const tabId = (idPrefix: string, id: string) => `${idPrefix}-tab-${id}`;
export const panelId = (idPrefix: string, id: string) => `${idPrefix}-panel-${id}`;

/** Onglets internes d'une page : flèches gauche/droite pour passer de l'un à l'autre, cibles de 48 px. */
export function SegmentedTabs<T extends string>({ label, idPrefix, options, value, onChange }: Props<T>) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const handleKeyDown = (event: KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    const next = options[(index + step + options.length) % options.length];
    onChange(next.id);
    refs.current[next.id]?.focus();
  };

  return (
    <div role="tablist" aria-label={label} className="grid grid-cols-3 rounded-full bg-soft-cloud p-1">
      {options.map((option, index) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            ref={(element) => {
              refs.current[option.id] = element;
            }}
            id={tabId(idPrefix, option.id)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId(idPrefix, option.id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`min-h-[48px] rounded-full px-sm font-button-md text-body-sm font-semibold ${selected ? 'bg-ink text-surface' : 'text-ink'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
