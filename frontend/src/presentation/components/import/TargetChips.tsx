import { KeyboardEvent } from 'react';
import { IMPORT_TARGETS, ImportTarget, TARGET_LABEL } from '../../../domain/statement-import';
import { TARGET_STYLE } from './target-style';

interface Props {
  label: string;
  value: ImportTarget | null;
  onChange: (target: ImportTarget) => void;
}

const ARROW_STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export function TargetChips({ label, value, onChange }: Props) {
  const tabStop = value ?? IMPORT_TARGETS[0];

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = ARROW_STEP[event.key];
    if (step === undefined) {
      return;
    }
    event.preventDefault();
    const current = IMPORT_TARGETS.indexOf((value ?? IMPORT_TARGETS[0]) as ImportTarget);
    const next = IMPORT_TARGETS[(current + step + IMPORT_TARGETS.length) % IMPORT_TARGETS.length];
    onChange(next);
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons[IMPORT_TARGETS.indexOf(next)]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={handleKeyDown} className="grid grid-cols-3 gap-sm">
      {IMPORT_TARGETS.map((target) => {
        const checked = value === target;
        const style = TARGET_STYLE[target];
        return (
          <button
            key={target}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={target === tabStop ? 0 : -1}
            onClick={() => onChange(target)}
            className={`min-h-[44px] rounded-full border-2 px-sm font-button-md text-body-sm font-semibold ${
              checked ? style.chipOn : style.chipOff
            }`}
          >
            {TARGET_LABEL[target]}
          </button>
        );
      })}
    </div>
  );
}
