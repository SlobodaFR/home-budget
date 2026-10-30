import { groupSteps, LifeEventStep, StepGroup } from '../../../domain/life-event';
import { ChevronRightIcon } from '../Icons';
import { STATUS_STYLE } from './life-event-style';
import { StepItem } from './StepItem';

interface Props {
  steps: LifeEventStep[];
  isSaving: (stepId: string) => boolean;
  onToggle: (stepId: string, done: boolean) => void;
  onSaveNote: (stepId: string, note: string) => Promise<void>;
}

function GroupTitle({ group }: { group: StepGroup }) {
  const style = STATUS_STYLE[group.status];
  const Icon = style.icon;
  return (
    <span className="flex items-center gap-sm">
      <span className={`inline-flex items-center gap-1 rounded-full px-md py-0.5 font-body-sm text-body-sm font-semibold ${style.badge}`}>
        <Icon width={16} height={16} />
        {group.label}
      </span>{' '}
      <span className="font-body-sm text-body-sm text-mute">{group.steps.length}</span>
    </span>
  );
}

/** Les démarches groupées par statut ; « Faites » est repliée pour ne pas noyer ce qui reste à faire. */
export function StepGroupList({ steps, isSaving, onToggle, onSaveNote }: Props) {
  const renderItems = (group: StepGroup) => (
    <ul aria-label={group.label} className="flex flex-col divide-y divide-hairline-soft">
      {group.steps.map((step) => (
        <StepItem
          key={step.stepId}
          step={step}
          saving={isSaving(step.stepId)}
          onToggle={(done) => onToggle(step.stepId, done)}
          onSaveNote={(note) => onSaveNote(step.stepId, note)}
        />
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-lg">
      {groupSteps(steps).map((group) =>
        group.status === 'DONE' ? (
          <details key={group.status} className="group rounded border border-hairline-soft" data-testid="step-group" data-status={group.status}>
            <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-md px-md">
              <GroupTitle group={group} />
              <ChevronRightIcon width={20} height={20} className="transition-transform group-open:rotate-90" />
            </summary>
            <div className="px-md pb-sm">{renderItems(group)}</div>
          </details>
        ) : (
          <section key={group.status} data-testid="step-group" data-status={group.status}>
            <h4 className="mb-1">
              <GroupTitle group={group} />
            </h4>
            {renderItems(group)}
          </section>
        ),
      )}
    </div>
  );
}
