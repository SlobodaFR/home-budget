import { LIFE_EVENTS_DISCLAIMER } from '../../../domain/life-event';
import { InfoIcon } from '../Icons';

/** Bandeau permanent : ces démarches sont des repères, la source officielle fait foi. */
export function LifeEventsDisclaimer() {
  return (
    <p className="flex items-start gap-sm rounded bg-soft-cloud p-md font-body-sm text-body-sm">
      <InfoIcon width={20} height={20} className="mt-0.5 shrink-0" />
      <span>{LIFE_EVENTS_DISCLAIMER}</span>
    </p>
  );
}
