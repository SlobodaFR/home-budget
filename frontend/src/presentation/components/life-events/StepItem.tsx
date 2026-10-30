import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { CATEGORY_LABEL, describeDoneAt, describeDue, LifeEventStep, stepLinkAction } from '../../../domain/life-event';
import { CheckIcon, ChevronDownIcon } from '../Icons';
import { buttonSecondary } from '../ui';
import { CATEGORY_ICON, STATUS_STYLE } from './life-event-style';
import { StepNote } from './StepNote';
import { StepSource } from './StepSource';

interface Props {
  step: LifeEventStep;
  /** Vrai pendant l'enregistrement de la coche : un nouveau clic est ignoré (la case reste focalisable). */
  saving: boolean;
  onToggle: (done: boolean) => void;
  onSaveNote: (note: string) => Promise<void>;
}

export function StepItem({ step, saving, onToggle, onSaveNote }: Props) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const style = STATUS_STYLE[step.status];
  const CategoryIcon = CATEGORY_ICON[step.category];
  const done = step.status === 'DONE';
  const due = describeDue(step);
  const doneAt = describeDoneAt(step);
  const action = stepLinkAction(step.link);
  const moreId = `${id}-more`;
  const metaId = `${id}-meta`;

  return (
    <li className={`border-l-4 py-sm pl-md ${style.accent}`} data-testid="life-step" data-status={step.status}>
      <div className="flex items-start gap-sm">
        <span className="relative -ml-2 flex h-11 w-11 shrink-0 items-center justify-center">
          <input
            id={`${id}-check`}
            type="checkbox"
            checked={done}
            aria-busy={saving || undefined}
            aria-describedby={metaId}
            onChange={() => {
              if (!saving) {
                onToggle(!done);
              }
            }}
            className="peer absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0"
          />
          <span
            aria-hidden="true"
            className={`pointer-events-none flex h-6 w-6 items-center justify-center rounded-md border-2 border-ink text-white transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ink peer-focus-visible:ring-offset-2 ${
              done ? 'bg-ink' : 'bg-white'
            } ${saving ? 'opacity-60' : ''}`}
          >
            {done && <CheckIcon width={16} height={16} strokeWidth={3} />}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <label htmlFor={`${id}-check`} className="block cursor-pointer break-words py-[10px] font-body-md text-body-md font-semibold">
            {step.title}
          </label>
          <div id={metaId} className="-mt-1 flex flex-col gap-1 font-body-sm text-body-sm">
            <p className="flex flex-wrap items-center gap-x-md gap-y-1">
              <span className="inline-flex items-center gap-1 rounded-full bg-soft-cloud px-md py-0.5 font-semibold">
                <CategoryIcon width={14} height={14} />
                {CATEGORY_LABEL[step.category]}
              </span>
              {done && doneAt && <span className="text-mute">{doneAt}</span>}
            </p>
            {!done && due && <p className={style.due}>{due}</p>}
          </div>

          <p className={`mt-sm break-words font-body-sm text-body-sm ${expanded ? '' : 'line-clamp-2'}`}>{step.detail}</p>
          {step.note !== '' && !expanded && (
            <p className="mt-1 break-words font-body-sm text-body-sm">
              <span className="font-semibold">Ma note : </span>
              {step.note}
            </p>
          )}

          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={moreId}
            onClick={() => setExpanded((value) => !value)}
            className="-ml-2 inline-flex min-h-[44px] items-center gap-1 px-2 font-body-sm text-body-sm font-semibold underline"
          >
            <ChevronDownIcon width={16} height={16} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
            {expanded ? 'Masquer le détail' : 'Voir le détail, la source et ma note'}
            <span className="sr-only"> : {step.title}</span>
          </button>

          {expanded && (
            <div id={moreId} className="flex flex-col items-start gap-sm pb-sm">
              {action && (
                <Link to={action.to} className={`${buttonSecondary} min-h-[44px] px-lg font-body-sm text-body-sm font-semibold`}>
                  {action.label}
                </Link>
              )}
              <StepSource step={step} />
              <StepNote note={step.note} onSave={onSaveNote} />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
