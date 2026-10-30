import {
  DAY_MS,
  addDays,
  parseIsoDate,
  startOfUtcDay,
  toIsoDate,
} from '../shared/calendar';
import { CatalogStep, LifeEventDefinition, StepCategory } from './catalog';
import { LifeEvent } from './life-event';

export type StepStatus =
  | 'DONE'
  | 'OVERDUE'
  | 'DUE_SOON'
  | 'UPCOMING'
  | 'NO_DATE';

/** Une étape à faire est « bientôt due » quand son échéance tombe dans ce nombre de jours (inclus). */
export const DUE_SOON_DAYS = 14;

export interface LifeEventStepView {
  stepId: string;
  title: string;
  detail: string;
  category: StepCategory;
  /** AAAA-MM-JJ ou null. */
  dueDate: string | null;
  dueLabel: string | null;
  status: StepStatus;
  doneAt: string | null;
  note: string;
  sourceLabel: string;
  sourceUrl: string;
  link: CatalogStep['link'];
}

export interface LifeEventView {
  id: string;
  type: LifeEvent['type'];
  label: string;
  eventDate: string;
  progressPercent: number;
  doneCount: number;
  totalCount: number;
  steps: LifeEventStepView[];
}

const STATUS_RANK: Record<StepStatus, number> = {
  OVERDUE: 0,
  DUE_SOON: 1,
  UPCOMING: 2,
  NO_DATE: 3,
  DONE: 4,
};

/** Échéance `AAAA-MM-JJ` = date de l'événement + décalage en jours (calendrier UTC, sans fuseau). */
export function dueDateOf(
  eventDate: string,
  offsetDays: number | null,
): string | null {
  if (offsetDays === null) {
    return null;
  }
  return toIsoDate(addDays(parseIsoDate(eventDate), offsetDays));
}

/** Nombre entier de jours de `from` à `to` (`AAAA-MM-JJ`), négatif si `to` est avant. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / DAY_MS,
  );
}

export function stepStatus(
  done: boolean,
  dueDate: string | null,
  today: string,
): StepStatus {
  if (done) {
    return 'DONE';
  }
  if (dueDate === null) {
    return 'NO_DATE';
  }
  const remaining = daysBetween(today, dueDate);
  if (remaining < 0) {
    return 'OVERDUE';
  }
  return remaining <= DUE_SOON_DAYS ? 'DUE_SOON' : 'UPCOMING';
}

/**
 * Vue d'un événement : les étapes viennent TOUJOURS du catalogue courant. Une étape
 * ajoutée au catalogue apparaît (non faite), une étape retirée disparaît, et l'état
 * « fait » enregistré est retrouvé par `stepId`. Fonction pure : `now` est l'horloge injectée.
 */
export function buildLifeEventView(
  event: LifeEvent,
  definition: LifeEventDefinition,
  now: Date,
): LifeEventView {
  const today = toIsoDate(startOfUtcDay(now));
  const steps = definition.steps
    .map((step, index) => {
      const progress = event.progressOf(step.id);
      const dueDate = dueDateOf(event.eventDate, step.dueOffsetDays);
      const done = progress?.doneAt != null;
      return {
        index,
        view: {
          stepId: step.id,
          title: step.title,
          detail: step.detail,
          category: step.category,
          dueDate,
          dueLabel: step.dueLabel,
          status: stepStatus(done, dueDate, today),
          doneAt: progress?.doneAt ? progress.doneAt.toISOString() : null,
          note: progress?.note ?? '',
          sourceLabel: step.sourceLabel,
          sourceUrl: step.sourceUrl,
          link: step.link,
        } satisfies LifeEventStepView,
      };
    })
    .sort(
      (a, b) =>
        STATUS_RANK[a.view.status] - STATUS_RANK[b.view.status] ||
        compareDueDates(a.view.dueDate, b.view.dueDate) ||
        a.index - b.index,
    )
    .map(({ view }) => view);

  const doneCount = steps.filter((s) => s.status === 'DONE').length;
  const totalCount = steps.length;
  return {
    id: event.id,
    type: event.type,
    label: event.label,
    eventDate: event.eventDate,
    doneCount,
    totalCount,
    progressPercent:
      totalCount === 0 ? 0 : Math.floor((doneCount * 100) / totalCount),
    steps,
  };
}

/** Échéance croissante, les étapes sans échéance après celles qui en ont. */
function compareDueDates(a: string | null, b: string | null): number {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return a < b ? -1 : 1;
}
