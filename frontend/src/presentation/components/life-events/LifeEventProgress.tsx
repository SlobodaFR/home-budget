import { Ref } from 'react';
import { describeProgress, LifeEvent } from '../../../domain/life-event';

/**
 * Barre de progression accessible : le texte « 3 démarches sur 18 faites — 16 % » est à la fois affiché et porté par la barre
 * (`aria-valuetext`) ; il est aussi annoncé quand il change (`aria-live`), par exemple après une coche.
 */
export const LifeEventProgress = ({ event, innerRef }: { event: Pick<LifeEvent, 'doneCount' | 'totalCount' | 'progressPercent' | 'label'>; innerRef?: Ref<HTMLDivElement> }) => {
  const text = describeProgress(event);
  return (
    <div ref={innerRef} tabIndex={-1} className="outline-none">
      <div
        role="progressbar"
        aria-label={`Progression : ${event.label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={event.progressPercent}
        aria-valuetext={text}
        className="h-3 w-full overflow-hidden rounded-full bg-soft-cloud"
      >
        <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${event.progressPercent}%` }} />
      </div>
      <p aria-live="polite" className="tabular mt-1 font-body-sm text-body-sm font-semibold">
        {text}
      </p>
    </div>
  );
};
