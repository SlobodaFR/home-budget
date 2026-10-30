import { useState } from 'react';
import { SkippedLine } from '../../../domain/statement-import';
import { ChevronRightIcon } from '../Icons';

const MAX_SHOWN = 100;

export function SkippedLines({ skipped }: { skipped: SkippedLine[] }) {
  const [open, setOpen] = useState(false);
  if (skipped.length === 0) {
    return null;
  }
  const label = skipped.length === 1 ? '1 ligne non lue' : `${skipped.length} lignes non lues`;

  return (
    <div className="rounded bg-soft-cloud px-gutter">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-[44px] w-full items-center justify-between gap-md font-body-sm text-body-sm font-semibold"
      >
        {label}
        <ChevronRightIcon width={18} height={18} className={open ? 'rotate-90' : ''} />
      </button>
      {open && (
        <ul className="pb-md font-body-sm text-body-sm text-mute">
          {skipped.slice(0, MAX_SHOWN).map((line) => (
            <li key={line.line}>
              Ligne {line.line} : {line.reason}
            </li>
          ))}
          {skipped.length > MAX_SHOWN && <li>… et {skipped.length - MAX_SHOWN} autres.</li>}
        </ul>
      )}
    </div>
  );
}
