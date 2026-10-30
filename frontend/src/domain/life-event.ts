import { describeVerification } from './aids';
import { insightAction } from './insights';
import { addMonths, formatDateInput, formatLongDateInput, isValidDateInput, todayInputValue } from './month';

export const MAX_EVENT_LABEL_LENGTH = 60;
export const MAX_STEP_NOTE_LENGTH = 200;
/** L'événement peut être daté de 24 mois dans le passé à 18 mois dans le futur (règle du serveur). */
export const EVENT_DATE_MAX_PAST_MONTHS = 24;
export const EVENT_DATE_MAX_FUTURE_MONTHS = 18;
/** Une démarche à faire est « bientôt due » quand son échéance tombe dans ce nombre de jours (règle du serveur). */
export const DUE_SOON_DAYS = 14;

export const BIRTH_TYPE = 'BIRTH';
export const BIRTH_DEFAULT_LABEL = 'Naissance d’un enfant';

export type StepStatus = 'OVERDUE' | 'DUE_SOON' | 'UPCOMING' | 'NO_DATE' | 'DONE';
export type StepCategory = 'ADMIN' | 'AIDES' | 'SANTE' | 'TRAVAIL' | 'BUDGET';

export const STEP_CATEGORIES: readonly StepCategory[] = ['ADMIN', 'AIDES', 'SANTE', 'TRAVAIL', 'BUDGET'];

export const CATEGORY_LABEL: Record<StepCategory, string> = {
  ADMIN: 'Administratif',
  AIDES: 'Aides',
  SANTE: 'Santé',
  TRAVAIL: 'Travail',
  BUDGET: 'Budget',
};

/** Les groupes, dans l'ordre d'affichage (le même que celui du serveur). */
export const STATUS_ORDER: readonly StepStatus[] = ['OVERDUE', 'DUE_SOON', 'UPCOMING', 'NO_DATE', 'DONE'];

export const STATUS_LABEL: Record<StepStatus, string> = {
  OVERDUE: 'En retard',
  DUE_SOON: `À faire bientôt (${DUE_SOON_DAYS} jours)`,
  UPCOMING: 'À venir',
  NO_DATE: 'Sans échéance fixe',
  DONE: 'Faites',
};

export const LIFE_EVENTS_DISCLAIMER = 'Repères, pas conseils juridiques ou fiscaux : vérifiez sur la source officielle de chaque démarche.';
export const NOTE_PRIVACY_HINT = 'Ne notez rien de sensible (numéro de dossier, mot de passe, santé) : toute la famille voit cette note.';

export interface LifeEventStep {
  stepId: string;
  title: string;
  detail: string;
  category: StepCategory;
  /** `AAAA-MM-JJ`. */
  dueDate: string | null;
  dueLabel: string | null;
  status: StepStatus;
  /** ISO complet ; `null` tant que la démarche n'est pas faite. */
  doneAt: string | null;
  note: string;
  sourceLabel: string;
  sourceUrl: string;
  /** `AAAA-MM-JJ`. Absent de la liste des événements : repris du catalogue (voir `attachVerification`). */
  verifiedOn: string | null;
  /** Route de l'application utile à la démarche, ou `null`. */
  link: string | null;
}

export interface LifeEvent {
  id: string;
  type: string;
  label: string;
  /** `AAAA-MM-JJ` : date de naissance prévue ou réelle. */
  eventDate: string;
  progressPercent: number;
  doneCount: number;
  totalCount: number;
  steps: LifeEventStep[];
}

export interface CatalogStep {
  id: string;
  title: string;
  detail: string;
  category: StepCategory;
  dueOffsetDays: number | null;
  dueLabel: string | null;
  sourceLabel: string;
  sourceUrl: string;
  verifiedOn: string | null;
  link: string | null;
}

export interface LifeEventDefinition {
  type: string;
  label: string;
  description: string;
  steps: CatalogStep[];
}

export interface LifeEventCreatePayload {
  type: string;
  eventDate: string;
  label?: string;
}

export interface LifeEventUpdatePayload {
  eventDate: string;
  label: string;
}

export interface StepChangePayload {
  done: boolean;
  note?: string;
}

// ---------------------------------------------------------------------------------------------------------------------
// Dates et statuts
// ---------------------------------------------------------------------------------------------------------------------

const dayNumber = (dateInput: string): number => Math.floor(Date.parse(`${dateInput}T00:00:00Z`) / 86_400_000);

/** Statut d'une démarche selon son échéance : les mêmes règles que le serveur (`DUE_SOON` : échéance dans les 14 jours, inclus). */
export function stepStatusFor(done: boolean, dueDate: string | null, now: Date = new Date()): StepStatus {
  if (done) {
    return 'DONE';
  }
  if (dueDate === null || !isValidDateInput(dueDate)) {
    return 'NO_DATE';
  }
  const remaining = dayNumber(dueDate) - dayNumber(todayInputValue(now));
  if (remaining < 0) {
    return 'OVERDUE';
  }
  return remaining <= DUE_SOON_DAYS ? 'DUE_SOON' : 'UPCOMING';
}

// ---------------------------------------------------------------------------------------------------------------------
// Lecture tolérante des réponses du serveur
// ---------------------------------------------------------------------------------------------------------------------

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isDate = (value: unknown): value is string => typeof value === 'string' && isValidDateInput(value.slice(0, 10));
const textOf = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const optionalText = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);

function categoryOf(value: unknown): StepCategory {
  return STEP_CATEGORIES.includes(value as StepCategory) ? (value as StepCategory) : 'ADMIN';
}

function isStatus(value: unknown): value is StepStatus {
  return STATUS_ORDER.includes(value as StepStatus);
}

function parseStep(raw: unknown, now: Date): LifeEventStep | null {
  const item = (raw ?? {}) as Record<string, unknown>;
  if (typeof item.stepId !== 'string' || typeof item.title !== 'string') {
    return null;
  }
  const doneAt = optionalText(item.doneAt);
  const dueDate = isDate(item.dueDate) ? item.dueDate.slice(0, 10) : null;
  return {
    stepId: item.stepId,
    title: item.title,
    detail: textOf(item.detail),
    category: categoryOf(item.category),
    dueDate,
    dueLabel: optionalText(item.dueLabel),
    // Un statut absent ou inconnu est recalculé plutôt que supposé ; « fait » suit toujours `doneAt`.
    status: isStatus(item.status) ? item.status : stepStatusFor(doneAt !== null, dueDate, now),
    doneAt,
    note: textOf(item.note),
    sourceLabel: textOf(item.sourceLabel),
    sourceUrl: textOf(item.sourceUrl),
    verifiedOn: isDate(item.verifiedOn) ? item.verifiedOn.slice(0, 10) : null,
    link: optionalText(item.link),
  };
}

/** Lit un événement ; `null` si l'essentiel (id, date) manque. Les compteurs absents sont recalculés à partir des démarches. */
export function parseLifeEvent(raw: unknown, now: Date = new Date()): LifeEvent | null {
  const item = (raw ?? {}) as Record<string, unknown>;
  if (typeof item.id !== 'string' || !isDate(item.eventDate)) {
    return null;
  }
  const steps: LifeEventStep[] = [];
  if (Array.isArray(item.steps)) {
    for (const entry of item.steps as unknown[]) {
      const step = parseStep(entry, now);
      if (step) {
        steps.push(step);
      }
    }
  }
  const event: LifeEvent = {
    id: item.id,
    type: textOf(item.type, BIRTH_TYPE),
    label: optionalText(item.label) ?? BIRTH_DEFAULT_LABEL,
    eventDate: item.eventDate.slice(0, 10),
    progressPercent: 0,
    doneCount: 0,
    totalCount: 0,
    steps: sortSteps(steps),
  };
  return withCounts(event);
}

/** Lit la liste ; le serveur trie déjà (du plus récent au plus ancien), on ne s'y fie pas. */
export function parseLifeEvents(raw: unknown, now: Date = new Date()): LifeEvent[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const events: LifeEvent[] = [];
  for (const entry of raw as unknown[]) {
    const event = parseLifeEvent(entry, now);
    if (event) {
      events.push(event);
    }
  }
  return sortEvents(events);
}

/** Du plus récent au plus ancien. */
export function sortEvents(events: readonly LifeEvent[]): LifeEvent[] {
  return [...events].sort((a, b) => (a.eventDate === b.eventDate ? 0 : a.eventDate < b.eventDate ? 1 : -1));
}

export function parseCatalog(raw: unknown): LifeEventDefinition[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const definitions: LifeEventDefinition[] = [];
  for (const entry of raw as unknown[]) {
    const item = (entry ?? {}) as Record<string, unknown>;
    if (typeof item.type !== 'string') {
      continue;
    }
    const steps: CatalogStep[] = [];
    if (Array.isArray(item.steps)) {
      for (const stepEntry of item.steps as unknown[]) {
        const step = (stepEntry ?? {}) as Record<string, unknown>;
        if (typeof step.id !== 'string' || typeof step.title !== 'string') {
          continue;
        }
        steps.push({
          id: step.id,
          title: step.title,
          detail: textOf(step.detail),
          category: categoryOf(step.category),
          dueOffsetDays: isNumber(step.dueOffsetDays) ? step.dueOffsetDays : null,
          dueLabel: optionalText(step.dueLabel),
          sourceLabel: textOf(step.sourceLabel),
          sourceUrl: textOf(step.sourceUrl),
          verifiedOn: isDate(step.verifiedOn) ? step.verifiedOn.slice(0, 10) : null,
          link: optionalText(step.link),
        });
      }
    }
    definitions.push({ type: item.type, label: optionalText(item.label) ?? BIRTH_DEFAULT_LABEL, description: textOf(item.description), steps });
  }
  return definitions;
}

/**
 * La liste des événements ne porte pas la date de vérification des sources (`verifiedOn`) : elle vient du catalogue.
 * Tant que le catalogue n'est pas là (ou si une démarche en est absente), la date reste `null` et n'est pas affichée.
 */
export function attachVerification(events: readonly LifeEvent[], catalog: readonly LifeEventDefinition[] | undefined): LifeEvent[] {
  if (!catalog || catalog.length === 0) {
    return [...events];
  }
  const verified = new Map<string, string>();
  for (const definition of catalog) {
    for (const step of definition.steps) {
      if (step.verifiedOn) {
        verified.set(step.id, step.verifiedOn);
      }
    }
  }
  return events.map((event) => ({
    ...event,
    steps: event.steps.map((step) => (step.verifiedOn || !verified.has(step.stepId) ? step : { ...step, verifiedOn: verified.get(step.stepId) ?? null })),
  }));
}

// ---------------------------------------------------------------------------------------------------------------------
// Tri, regroupement et compteurs
// ---------------------------------------------------------------------------------------------------------------------

/** Par groupe de statut, puis par échéance croissante (sans échéance en dernier) ; l'ordre du catalogue départage. */
export function sortSteps(steps: readonly LifeEventStep[]): LifeEventStep[] {
  return steps
    .map((step, index) => ({ step, index }))
    .sort((a, b) => {
      const rank = STATUS_ORDER.indexOf(a.step.status) - STATUS_ORDER.indexOf(b.step.status);
      if (rank !== 0) {
        return rank;
      }
      const dueA = a.step.dueDate;
      const dueB = b.step.dueDate;
      if (dueA !== dueB) {
        return dueA === null ? 1 : dueB === null ? -1 : dueA < dueB ? -1 : 1;
      }
      return a.index - b.index;
    })
    .map(({ step }) => step);
}

export interface StepGroup {
  status: StepStatus;
  label: string;
  steps: LifeEventStep[];
}

/** Les groupes non vides, dans l'ordre : en retard, bientôt, à venir, sans échéance, faites. */
export function groupSteps(steps: readonly LifeEventStep[]): StepGroup[] {
  const sorted = sortSteps(steps);
  return STATUS_ORDER.map((status) => ({ status, label: STATUS_LABEL[status], steps: sorted.filter((step) => step.status === status) })).filter(
    (group) => group.steps.length > 0,
  );
}

/** Recalcule les compteurs (faites, total, pourcentage entier arrondi à l'inférieur) à partir des démarches. */
export function withCounts(event: LifeEvent): LifeEvent {
  const doneCount = event.steps.filter((step) => step.status === 'DONE').length;
  const totalCount = event.steps.length;
  return { ...event, doneCount, totalCount, progressPercent: totalCount === 0 ? 0 : Math.floor((doneCount * 100) / totalCount) };
}

export function countByStatus(event: Pick<LifeEvent, 'steps'>, status: StepStatus): number {
  return event.steps.filter((step) => step.status === status).length;
}

// ---------------------------------------------------------------------------------------------------------------------
// Mises à jour locales (affichage immédiat avant la réponse du serveur)
// ---------------------------------------------------------------------------------------------------------------------

export interface StepChange {
  done?: boolean;
  note?: string;
}

function mapStep(events: readonly LifeEvent[], eventId: string, stepId: string, change: (step: LifeEventStep) => LifeEventStep): LifeEvent[] {
  return events.map((event) => {
    if (event.id !== eventId || !event.steps.some((step) => step.stepId === stepId)) {
      return event;
    }
    return withCounts({ ...event, steps: sortSteps(event.steps.map((step) => (step.stepId === stepId ? change(step) : step))) });
  });
}

/** Applique une coche ou une note : « faite » fixe le statut `DONE` ; décochée, le statut est recalculé d'après l'échéance. */
export function applyStepChange(events: readonly LifeEvent[], eventId: string, stepId: string, change: StepChange, now: Date = new Date()): LifeEvent[] {
  return mapStep(events, eventId, stepId, (step) => {
    const done = change.done ?? step.doneAt !== null;
    return {
      ...step,
      note: change.note ?? step.note,
      doneAt: done ? (step.doneAt ?? now.toISOString()) : null,
      status: stepStatusFor(done, step.dueDate, now),
    };
  });
}

/** Retour arrière : remet la démarche telle qu'elle était avant l'essai. */
export function restoreStep(events: readonly LifeEvent[], eventId: string, original: LifeEventStep): LifeEvent[] {
  return mapStep(events, eventId, original.stepId, () => original);
}

// ---------------------------------------------------------------------------------------------------------------------
// Libellés
// ---------------------------------------------------------------------------------------------------------------------

/** « 3 démarches sur 18 faites — 16 % » : affiché sous la barre et porté par la barre (`aria-valuetext`). */
export function describeProgress(event: Pick<LifeEvent, 'doneCount' | 'totalCount' | 'progressPercent'>): string {
  if (event.totalCount === 0) {
    return 'Aucune démarche à suivre pour l’instant';
  }
  const many = event.doneCount > 1;
  return `${event.doneCount} ${many ? 'démarches' : 'démarche'} sur ${event.totalCount} ${many ? 'faites' : 'faite'} — ${event.progressPercent} %`;
}

/** « Naissance prévue le 12 novembre 2026 » ou « Naissance le 3 octobre 2026 » selon que la date est passée. */
export function describeEventDate(event: Pick<LifeEvent, 'type' | 'eventDate'>, now: Date = new Date()): string {
  const date = formatLongDateInput(event.eventDate);
  const future = event.eventDate > todayInputValue(now);
  if (event.type === BIRTH_TYPE) {
    return future ? `Naissance prévue le ${date}` : `Naissance le ${date}`;
  }
  return future ? `Prévu le ${date}` : `Le ${date}`;
}

/** « Échéance le 5 nov. 2026 · Dans les 5 jours après la naissance », ou le seul libellé quand il n'y a pas de date ; `null` sinon. */
export function describeDue(step: Pick<LifeEventStep, 'dueDate' | 'dueLabel'>): string | null {
  if (step.dueDate && step.dueLabel) {
    return `Échéance le ${formatDateInput(step.dueDate)} · ${step.dueLabel}`;
  }
  if (step.dueDate) {
    return `Échéance le ${formatDateInput(step.dueDate)}`;
  }
  return step.dueLabel;
}

export function describeDoneAt(step: Pick<LifeEventStep, 'doneAt'>): string | null {
  return step.doneAt && isDate(step.doneAt) ? `Faite le ${formatDateInput(step.doneAt)}` : null;
}

/** « vérifié le 30 octobre 2026 », ou `null` quand la date n'est pas connue. */
export function describeSourceVerification(step: Pick<LifeEventStep, 'verifiedOn'>): string | null {
  return step.verifiedOn && isValidDateInput(step.verifiedOn) ? describeVerification(step.verifiedOn) : null;
}

/** « 2 en retard · 3 à faire bientôt » ; `null` quand rien ne presse. */
export function describeUrgency(event: Pick<LifeEvent, 'steps'>): string | null {
  const overdue = countByStatus(event, 'OVERDUE');
  const soon = countByStatus(event, 'DUE_SOON');
  const parts: string[] = [];
  if (overdue > 0) {
    parts.push(`${overdue} en retard`);
  }
  if (soon > 0) {
    parts.push(`${soon} à faire bientôt`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Le nombre de démarches du catalogue par thème (état vide : « 5 Administratif, 4 Aides… »). */
export function countByCategory(steps: readonly Pick<CatalogStep, 'category'>[]): { category: StepCategory; count: number }[] {
  return STEP_CATEGORIES.map((category) => ({ category, count: steps.filter((step) => step.category === category).length })).filter((entry) => entry.count > 0);
}

/** Seules les routes connues de l'application ouvrent un bouton ; réutilise les libellés des conseils (« Voir les aides »…). */
const STEP_LINKS: readonly string[] = ['/aides', '/plan', '/previsionnel', '/projets', '/comptes'];

export function stepLinkAction(link: string | null): { to: string; label: string } | null {
  if (link === null || !STEP_LINKS.includes(link)) {
    return null;
  }
  return insightAction(link);
}

// ---------------------------------------------------------------------------------------------------------------------
// Formulaires
// ---------------------------------------------------------------------------------------------------------------------

export interface LifeEventFormValues {
  eventDate: string;
  label: string;
}

export interface LifeEventFormErrors {
  eventDate?: string;
  label?: string;
}

export type LifeEventFormResult = { ok: true; payload: { eventDate: string; label?: string } } | { ok: false; errors: LifeEventFormErrors };

export const emptyLifeEventForm = (): LifeEventFormValues => ({ eventDate: '', label: '' });

export const lifeEventToForm = (event: Pick<LifeEvent, 'eventDate' | 'label'>): LifeEventFormValues => ({ eventDate: event.eventDate, label: event.label });

/** Les bornes de la date (incluses), pour l'attribut `min`/`max` du champ et pour la validation. */
export function eventDateBounds(now: Date = new Date()): { min: string; max: string } {
  const today = todayInputValue(now);
  return { min: addMonths(today, -EVENT_DATE_MAX_PAST_MONTHS), max: addMonths(today, EVENT_DATE_MAX_FUTURE_MONTHS) };
}

/**
 * Valide le formulaire d'un événement. À la création le libellé est facultatif (le serveur met « Naissance d'un enfant ») ;
 * à la modification il est obligatoire, le serveur refusant un libellé vide.
 */
export function buildLifeEventPayload(values: LifeEventFormValues, options: { now?: Date; labelRequired?: boolean } = {}): LifeEventFormResult {
  const errors: LifeEventFormErrors = {};
  const { min, max } = eventDateBounds(options.now);

  if (values.eventDate.trim() === '') {
    errors.eventDate = 'Indiquez la date de naissance (prévue ou réelle).';
  } else if (!isValidDateInput(values.eventDate)) {
    errors.eventDate = 'Cette date n’est pas valide : choisissez un jour dans le calendrier.';
  } else if (values.eventDate < min || values.eventDate > max) {
    errors.eventDate = `La date doit être entre le ${formatLongDateInput(min)} et le ${formatLongDateInput(max)} (de 24 mois avant à 18 mois après aujourd’hui).`;
  }

  const label = values.label.trim();
  if (label.length > MAX_EVENT_LABEL_LENGTH) {
    errors.label = `Le libellé est trop long (${MAX_EVENT_LABEL_LENGTH} caractères au plus).`;
  } else if (label === '' && options.labelRequired) {
    errors.label = 'Donnez un libellé à cet événement (ou remettez « Naissance d’un enfant »).';
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, payload: label === '' ? { eventDate: values.eventDate } : { eventDate: values.eventDate, label } };
}

/** Vérifie la note d'une démarche ; renvoie le texte à envoyer (sans espaces en bordure) ou un message d'erreur. */
export function validateNote(note: string): { ok: true; note: string } | { ok: false; error: string } {
  const trimmed = note.trim();
  if (trimmed.length > MAX_STEP_NOTE_LENGTH) {
    return { ok: false, error: `La note est trop longue (${MAX_STEP_NOTE_LENGTH} caractères au plus).` };
  }
  return { ok: true, note: trimmed };
}
