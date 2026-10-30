import {
  daysInMonth,
  isIsoDate,
  startOfUtcDay,
  toIsoDate,
} from '../shared/calendar';
import { DomainError } from '../shared/domain-error';
import { LIFE_EVENT_TYPES, LifeEventType } from './catalog';

export const MAX_LIFE_EVENT_LABEL_LENGTH = 60;
export const MAX_STEP_NOTE_LENGTH = 200;
/** L'événement peut être daté de 24 mois dans le passé à 18 mois dans le futur. */
export const EVENT_DATE_MAX_PAST_MONTHS = 24;
export const EVENT_DATE_MAX_FUTURE_MONTHS = 18;

/** État enregistré d'une étape du catalogue (la clé est `stepId`). */
export interface StepProgress {
  stepId: string;
  /** null = pas faite (la note, elle, est conservée). */
  doneAt: Date | null;
  note: string;
}

export interface LifeEventProps {
  id: string;
  householdId: string;
  type: LifeEventType;
  label: string;
  /** AAAA-MM-JJ, sans fuseau : date de naissance prévue ou réelle. */
  eventDate: string;
  createdAt: Date;
  progress: StepProgress[];
}

/** `AAAA-MM-JJ` décalé de `months` mois civils (jour ramené au dernier jour du mois si besoin). */
export function shiftIsoDateByMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const total = year * 12 + (month - 1) + months;
  const y = Math.floor(total / 12);
  const m = total - y * 12;
  const d = Math.min(day, daysInMonth(y, m));
  return `${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Vérifie que `eventDate` est une date réelle comprise entre -24 et +18 mois autour d'aujourd'hui. */
export function assertEventDateInRange(eventDate: string, today: Date): void {
  if (!isIsoDate(eventDate)) {
    throw new DomainError(
      "Date de l'événement invalide, format attendu : AAAA-MM-JJ",
    );
  }
  const todayIso = toIsoDate(startOfUtcDay(today));
  const earliest = shiftIsoDateByMonths(todayIso, -EVENT_DATE_MAX_PAST_MONTHS);
  const latest = shiftIsoDateByMonths(todayIso, EVENT_DATE_MAX_FUTURE_MONTHS);
  if (eventDate < earliest || eventDate > latest) {
    throw new DomainError(
      `La date de l'événement doit être comprise entre ${EVENT_DATE_MAX_PAST_MONTHS} mois dans le passé et ${EVENT_DATE_MAX_FUTURE_MONTHS} mois dans le futur`,
    );
  }
}

export function normalizeLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    throw new DomainError("Le libellé de l'événement ne doit pas être vide");
  }
  if (trimmed.length > MAX_LIFE_EVENT_LABEL_LENGTH) {
    throw new DomainError(
      `Libellé trop long (${MAX_LIFE_EVENT_LABEL_LENGTH} caractères au plus)`,
    );
  }
  return trimmed;
}

export function normalizeNote(note: string): string {
  const trimmed = note.trim();
  if (trimmed.length > MAX_STEP_NOTE_LENGTH) {
    throw new DomainError(
      `Note trop longue (${MAX_STEP_NOTE_LENGTH} caractères au plus)`,
    );
  }
  return trimmed;
}

/**
 * Événement de vie d'un foyer. Il ne stocke QUE l'état des étapes (fait / note) : les
 * étapes elles-mêmes viennent du catalogue à la lecture (cf. `buildLifeEventView`).
 * Objet immuable : chaque modification renvoie une copie. Valide les invariants
 * indépendants de l'horloge (la plage de dates, elle, dépend d'aujourd'hui).
 */
export class LifeEvent {
  private constructor(private readonly props: LifeEventProps) {
    if (!(LIFE_EVENT_TYPES as readonly string[]).includes(props.type)) {
      throw new DomainError("Type d'événement inconnu");
    }
    if (!isIsoDate(props.eventDate)) {
      throw new DomainError(
        "Date de l'événement invalide, format attendu : AAAA-MM-JJ",
      );
    }
    normalizeLabel(props.label);
  }

  static create(props: LifeEventProps): LifeEvent {
    return new LifeEvent({
      ...props,
      label: normalizeLabel(props.label),
      progress: props.progress.map((p) => ({ ...p })),
    });
  }

  get id(): string {
    return this.props.id;
  }

  get householdId(): string {
    return this.props.householdId;
  }

  get type(): LifeEventType {
    return this.props.type;
  }

  get label(): string {
    return this.props.label;
  }

  get eventDate(): string {
    return this.props.eventDate;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get progress(): readonly StepProgress[] {
    return this.props.progress;
  }

  progressOf(stepId: string): StepProgress | null {
    return this.props.progress.find((p) => p.stepId === stepId) ?? null;
  }

  /** Les étapes faites restent faites : changer la date ne touche pas à l'avancement. */
  withDetails(label: string, eventDate: string): LifeEvent {
    return LifeEvent.create({ ...this.props, label, eventDate });
  }

  /**
   * Coche ou décoche une étape. `doneAt` est conservé si l'étape était déjà faite ;
   * la note n'est remplacée que si `note` est fourni. Une étape ni faite ni annotée
   * n'est plus enregistrée.
   */
  withStep(stepId: string, done: boolean, now: Date, note?: string): LifeEvent {
    const existing = this.progressOf(stepId);
    const nextNote =
      note === undefined ? (existing?.note ?? '') : normalizeNote(note);
    const doneAt = done ? (existing?.doneAt ?? now) : null;
    const others = this.props.progress.filter((p) => p.stepId !== stepId);
    const progress =
      doneAt === null && nextNote === ''
        ? others
        : [...others, { stepId, doneAt, note: nextNote }];
    return LifeEvent.create({ ...this.props, progress });
  }
}
