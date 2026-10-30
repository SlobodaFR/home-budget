import { useRef } from 'react';
import { describeEventDate, describeUrgency, LifeEvent } from '../../../domain/life-event';
import { BabyIcon, PencilIcon } from '../Icons';
import { cardClass } from '../ui';
import { LifeEventProgress } from './LifeEventProgress';
import { StepGroupList } from './StepGroupList';

interface Props {
  event: LifeEvent;
  isSaving: (stepId: string) => boolean;
  onToggle: (stepId: string, done: boolean) => void;
  onSaveNote: (stepId: string, note: string) => Promise<void>;
  onEdit: (event: LifeEvent) => void;
  now?: () => Date;
}

const actionButton =
  'inline-flex min-h-[44px] items-center justify-center gap-1 rounded-full border border-hairline px-lg font-body-sm text-body-sm font-semibold text-ink hover:bg-soft-cloud';

export function LifeEventCard({ event, isSaving, onToggle, onSaveNote, onEdit, now = () => new Date() }: Props) {
  const progressRef = useRef<HTMLDivElement>(null);
  const urgency = describeUrgency(event);

  // Une démarche cochée change de groupe : la case que l'on vient d'utiliser disparaît de son endroit. Le focus revient
  // à la progression (qui annonce le nouveau total) plutôt que de se perdre.
  const handleToggle = (stepId: string, done: boolean) => {
    onToggle(stepId, done);
    progressRef.current?.focus({ preventScroll: true });
  };

  return (
    <li className={`${cardClass} flex flex-col gap-md`} data-testid="life-event">
      <div className="flex items-start gap-md">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-soft-cloud">
          <BabyIcon width={22} height={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="break-words font-heading-lg text-heading-lg">{event.label}</h3>
          <p className="font-body-sm text-body-sm text-mute">{describeEventDate(event, now())}</p>
        </div>
        <button type="button" onClick={() => onEdit(event)} aria-label={`Modifier ${event.label}`} className={actionButton}>
          <PencilIcon width={18} height={18} />
          Modifier
        </button>
      </div>

      <LifeEventProgress event={event} innerRef={progressRef} />
      {urgency && <p className="font-body-sm text-body-sm font-semibold">{urgency}</p>}

      <StepGroupList steps={event.steps} isSaving={isSaving} onToggle={handleToggle} onSaveNote={onSaveNote} />
    </li>
  );
}
