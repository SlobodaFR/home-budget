import { CONTRIBUTION_MODE_INFO, CONTRIBUTION_MODES, ContributionMode } from '../../domain/household';

interface Props {
  mode: ContributionMode;
  disabled: boolean;
  onChange: (mode: ContributionMode) => void;
}

export function ContributionRule({ mode, disabled, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label="Règle de contribution" className="flex flex-col gap-sm">
      {CONTRIBUTION_MODES.map((option) => {
        const info = CONTRIBUTION_MODE_INFO[option];
        const selected = option === mode;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => !selected && onChange(option)}
            className={`flex min-h-[64px] items-start gap-md rounded border-2 p-md text-left transition-colors ${
              selected ? 'border-ink bg-white' : 'border-hairline-soft bg-white hover:border-hairline'
            }`}
          >
            <span
              className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-ink' : 'border-hairline'}`}
              aria-hidden="true"
            >
              {selected && <span className="h-2.5 w-2.5 rounded-full bg-ink" />}
            </span>
            <span>
              <span className="block font-body-md text-body-md font-semibold">{info.label}</span>
              <span className="block font-body-sm text-body-sm text-mute">{info.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
