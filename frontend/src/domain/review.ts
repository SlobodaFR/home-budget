import { Bloc, BLOC_INFO, BLOCS, isBloc } from './bloc';
import { formatCentsShort } from './money';
import { currentMonth, formatLongDateInput, isMonth, shiftMonth } from './month';

export const MAX_REVIEW_ANSWER_LENGTH = 500;

/** Jusqu'à ce jour du mois (inclus), la revue proposée par défaut est celle du mois qui vient de se terminer. */
export const REVIEW_GRACE_DAYS = 7;

export type ReviewStatus = 'TODO' | 'DRAFT' | 'DONE';

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  TODO: 'À faire',
  DRAFT: 'Brouillon',
  DONE: 'Terminée',
};

export interface ReviewAnswers {
  wentWell: string;
  surprise: string;
  decision: string;
}

export type ReviewField = keyof ReviewAnswers;

export const REVIEW_FIELDS: readonly ReviewField[] = ['wentWell', 'surprise', 'decision'];

export const REVIEW_QUESTIONS: Record<ReviewField, { label: string; hint: string; placeholder: string }> = {
  wentWell: {
    label: 'Qu’est-ce qui a bien marché ?',
    hint: 'Une habitude tenue, une dépense évitée, un objectif atteint…',
    placeholder: 'Ex. : on a cuisiné plus à la maison.',
  },
  surprise: {
    label: 'Qu’est-ce qui m’a surpris ?',
    hint: 'Une dépense plus haute que prévu, un oubli, une bonne surprise…',
    placeholder: 'Ex. : les courses ont coûté plus cher qu’en septembre.',
  },
  decision: {
    label: 'Quelle décision pour le mois prochain ?',
    hint: 'Une seule chose, simple et concrète.',
    placeholder: 'Ex. : fixer 400 € pour les courses et vérifier chaque dimanche.',
  },
};

export interface ReviewBlocFigure {
  bloc: Bloc;
  plannedCents: number;
  actualCents: number;
  /** Réel − prévu. */
  deltaCents: number;
}

export interface TopExpense {
  label: string;
  amountCents: number;
  count: number;
}

export interface MissingRecurring {
  label: string;
  amountCents: number;
}

export interface ReviewSnapshot {
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  /** Entier, négatif possible ; 0 s'il n'y a pas de revenu. */
  savingsRatePercent: number;
  blocs: ReviewBlocFigure[];
  topExpenses: TopExpense[];
  missingRecurring: MissingRecurring[];
  unassignedTransactionCount: number;
}

export interface MonthlyReview {
  month: string;
  status: ReviewStatus;
  answers: ReviewAnswers;
  /** ISO complet, ou `null` tant que la revue n'est pas terminée. */
  completedAt: string | null;
  snapshot: ReviewSnapshot;
}

export interface ReviewHistoryItem {
  month: string;
  status: Exclude<ReviewStatus, 'TODO'>;
  decision: string;
  completedAt: string | null;
}

export interface ReviewPayload {
  answers: ReviewAnswers;
  complete: boolean;
}

export const MAX_TOP_EXPENSES = 5;

// ---------------------------------------------------------------------------------------------------------------------
// Lecture tolérante des réponses du serveur
// ---------------------------------------------------------------------------------------------------------------------

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const asObject = (value: unknown): Record<string, unknown> => (value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {});
const asCents = (value: unknown): number => (isNumber(value) ? Math.round(value) : 0);
const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

export const EMPTY_ANSWERS: ReviewAnswers = { wentWell: '', surprise: '', decision: '' };

export function parseAnswers(raw: unknown): ReviewAnswers {
  const source = asObject(raw);
  return { wentWell: asText(source.wentWell), surprise: asText(source.surprise), decision: asText(source.decision) };
}

export function isBlankAnswers(answers: ReviewAnswers): boolean {
  return REVIEW_FIELDS.every((field) => answers[field].trim() === '');
}

export function parseSnapshot(raw: unknown): ReviewSnapshot {
  const source = asObject(raw);
  const incomeCents = asCents(source.incomeCents);
  const expenseCents = asCents(source.expenseCents);
  const balanceCents = isNumber(source.balanceCents) ? Math.round(source.balanceCents) : incomeCents - expenseCents;
  const savingsRatePercent = isNumber(source.savingsRatePercent)
    ? Math.round(source.savingsRatePercent)
    : incomeCents > 0
      ? Math.round((balanceCents / incomeCents) * 100)
      : 0;

  const byBloc = new Map<Bloc, ReviewBlocFigure>();
  if (Array.isArray(source.blocs)) {
    for (const entry of source.blocs as unknown[]) {
      const item = asObject(entry);
      if (!isBloc(item.bloc) || byBloc.has(item.bloc)) {
        continue;
      }
      const plannedCents = asCents(item.plannedCents);
      const actualCents = asCents(item.actualCents);
      byBloc.set(item.bloc, {
        bloc: item.bloc,
        plannedCents,
        actualCents,
        deltaCents: isNumber(item.deltaCents) ? Math.round(item.deltaCents) : actualCents - plannedCents,
      });
    }
  }
  // Toujours les quatre blocs, dans l'ordre du plan : un bloc absent de la réponse vaut zéro.
  const blocs = BLOCS.map((bloc) => byBloc.get(bloc) ?? { bloc, plannedCents: 0, actualCents: 0, deltaCents: 0 });

  const topExpenses: TopExpense[] = [];
  if (Array.isArray(source.topExpenses)) {
    for (const entry of source.topExpenses as unknown[]) {
      const item = asObject(entry);
      if (typeof item.label !== 'string' || !isNumber(item.amountCents)) {
        continue;
      }
      topExpenses.push({ label: item.label, amountCents: Math.round(item.amountCents), count: isNumber(item.count) ? Math.max(0, Math.trunc(item.count)) : 1 });
    }
  }

  const missingRecurring: MissingRecurring[] = [];
  if (Array.isArray(source.missingRecurring)) {
    for (const entry of source.missingRecurring as unknown[]) {
      const item = asObject(entry);
      if (typeof item.label !== 'string') {
        continue;
      }
      missingRecurring.push({ label: item.label, amountCents: asCents(item.amountCents) });
    }
  }

  return {
    incomeCents,
    expenseCents,
    balanceCents,
    savingsRatePercent,
    blocs,
    topExpenses: topExpenses.sort((a, b) => b.amountCents - a.amountCents).slice(0, MAX_TOP_EXPENSES),
    missingRecurring,
    unassignedTransactionCount: isNumber(source.unassignedTransactionCount) ? Math.max(0, Math.trunc(source.unassignedTransactionCount)) : 0,
  };
}

function statusOf(value: unknown, answers: ReviewAnswers, completedAt: string | null): ReviewStatus {
  if (value === 'TODO' || value === 'DRAFT' || value === 'DONE') {
    return value;
  }
  if (completedAt) {
    return 'DONE';
  }
  return isBlankAnswers(answers) ? 'TODO' : 'DRAFT';
}

/** Lit une revue ; `fallbackMonth` sert si le serveur ne renvoie pas le mois. `null` si la réponse n'est pas un objet. */
export function parseReview(raw: unknown, fallbackMonth: string): MonthlyReview | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const source = raw as Record<string, unknown>;
  const answers = parseAnswers(source.answers);
  const completedAt = typeof source.completedAt === 'string' && source.completedAt !== '' ? source.completedAt : null;
  return {
    month: typeof source.month === 'string' && isMonth(source.month) ? source.month : fallbackMonth,
    status: statusOf(source.status, answers, completedAt),
    answers,
    completedAt,
    snapshot: parseSnapshot(source.snapshot),
  };
}

/** L'historique : seulement les revues commencées, de la plus récente à la plus ancienne (on ne se fie pas au tri du serveur). */
export function parseReviewHistory(raw: unknown): ReviewHistoryItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const items: ReviewHistoryItem[] = [];
  for (const entry of raw as unknown[]) {
    const item = asObject(entry);
    if (typeof item.month !== 'string' || !isMonth(item.month)) {
      continue;
    }
    const completedAt = typeof item.completedAt === 'string' && item.completedAt !== '' ? item.completedAt : null;
    const status = item.status === 'DONE' || item.status === 'DRAFT' ? item.status : completedAt ? 'DONE' : null;
    if (status === null) {
      continue;
    }
    items.push({ month: item.month, status, decision: asText(item.decision), completedAt });
  }
  return items.sort((a, b) => (a.month === b.month ? 0 : a.month < b.month ? 1 : -1));
}

// ---------------------------------------------------------------------------------------------------------------------
// Choix du mois
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Le mois proposé à l'ouverture : le mois précédent pendant les sept premiers jours, tant que sa revue n'est pas terminée
 * (c'est le moment naturel pour la faire) ; sinon le mois en cours. Jamais un mois futur.
 */
export function defaultReviewMonth(now: Date = new Date(), history: readonly Pick<ReviewHistoryItem, 'month' | 'status'>[] = []): string {
  const current = currentMonth(now);
  if (now.getDate() > REVIEW_GRACE_DAYS) {
    return current;
  }
  const previous = shiftMonth(current, -1);
  const previousDone = history.some((item) => item.month === previous && item.status === 'DONE');
  return previousDone ? current : previous;
}

export function isFutureMonth(month: string, now: Date = new Date()): boolean {
  return month > currentMonth(now);
}

/** Ramène un mois futur au mois en cours. */
export function clampReviewMonth(month: string, now: Date = new Date()): string {
  return isFutureMonth(month, now) ? currentMonth(now) : month;
}

export function isOngoingMonth(month: string, now: Date = new Date()): boolean {
  return month === currentMonth(now);
}

// ---------------------------------------------------------------------------------------------------------------------
// Bilan lisible
// ---------------------------------------------------------------------------------------------------------------------

export type BlocVerdictTone = 'good' | 'warn' | 'neutral';

export interface BlocVerdict {
  tone: BlocVerdictTone;
  /** Court libellé du verdict, toujours écrit (la couleur n'est qu'un renfort). */
  label: string;
  /** Phrase complète : « Dépassement de 40 € par rapport au prévu. » */
  text: string;
}

/** Dépenser moins que prévu est une bonne nouvelle, sauf pour l'épargne où c'est l'inverse. */
export function blocVerdict(figure: ReviewBlocFigure): BlocVerdict {
  const { plannedCents, actualCents, deltaCents } = figure;
  if (plannedCents === 0 && actualCents === 0) {
    return { tone: 'neutral', label: 'Rien de prévu', text: 'Rien de prévu et rien de dépensé.' };
  }
  const amount = formatCentsShort(Math.abs(deltaCents));
  if (figure.bloc === 'EPARGNE') {
    if (deltaCents < 0) {
      return { tone: 'warn', label: 'En dessous du prévu', text: `Il manque ${amount} par rapport à l’épargne prévue.` };
    }
    return deltaCents === 0
      ? { tone: 'good', label: 'Objectif atteint', text: 'Vous avez mis de côté exactement ce qui était prévu.' }
      : { tone: 'good', label: 'Objectif dépassé', text: `Vous avez mis de côté ${amount} de plus que prévu.` };
  }
  if (deltaCents > 0) {
    return { tone: 'warn', label: 'Dépassement', text: `Dépassement de ${amount} par rapport au prévu.` };
  }
  return deltaCents === 0
    ? { tone: 'good', label: 'Pile dans le prévu', text: 'Dépensé exactement ce qui était prévu.' }
    : { tone: 'good', label: 'Sous le prévu', text: `${amount} de moins que prévu.` };
}

export function blocLabel(bloc: Bloc): string {
  return BLOC_INFO[bloc].label;
}

/** « 8 % » ; « — » quand le mois n'a aucun revenu (un taux n'aurait pas de sens). */
export function describeSavingsRate(snapshot: Pick<ReviewSnapshot, 'incomeCents' | 'savingsRatePercent'>): string {
  return snapshot.incomeCents > 0 ? `${snapshot.savingsRatePercent} %` : '—';
}

export function describeSavingsRateNote(snapshot: Pick<ReviewSnapshot, 'incomeCents' | 'savingsRatePercent'>): string {
  if (snapshot.incomeCents <= 0) {
    return 'Aucun revenu ce mois-ci : pas de taux à calculer.';
  }
  return snapshot.savingsRatePercent < 0 ? 'Vous avez dépensé plus que vos revenus.' : 'de vos revenus mis de côté';
}

export function describeBalance(balanceCents: number): string {
  if (balanceCents < 0) {
    return `Vous avez dépensé ${formatCentsShort(-balanceCents)} de plus que vos revenus.`;
  }
  return balanceCents === 0 ? 'Revenus et dépenses sont à l’équilibre.' : `Il vous est resté ${formatCentsShort(balanceCents)} après toutes les dépenses.`;
}

export function describeExpenseCount(count: number): string {
  return count > 1 ? `${count} opérations` : '1 opération';
}

export function describeMissingRecurring(items: readonly MissingRecurring[]): string {
  return items.length > 1 ? `${items.length} paiements récurrents introuvables` : '1 paiement récurrent introuvable';
}

export function describeUnassigned(count: number): string {
  return count > 1 ? `${count} opérations ne sont rattachées à aucun compte.` : '1 opération n’est rattachée à aucun compte.';
}

/** Un mois sans aucun mouvement : le bilan serait vide, on propose d'abord d'importer un relevé. */
export function isEmptyMonth(snapshot: ReviewSnapshot): boolean {
  return snapshot.incomeCents === 0 && snapshot.expenseCents === 0 && snapshot.topExpenses.length === 0;
}

/** « Revue terminée le 3 novembre 2026 » (ISO complet ou date seule). */
export function describeCompletion(completedAt: string): string {
  return `Revue terminée le ${formatLongDateInput(completedAt)}`;
}

/** « Terminée le 3 novembre 2026 » : la version courte de l'historique, où le statut est déjà écrit à côté. */
export function describeCompletedOn(completedAt: string): string {
  return `Terminée le ${formatLongDateInput(completedAt)}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Formulaire des trois questions
// ---------------------------------------------------------------------------------------------------------------------

export type ReviewFormErrors = Partial<Record<ReviewField, string>>;

export type ReviewFormResult = { ok: true; payload: ReviewPayload } | { ok: false; errors: ReviewFormErrors };

export const DECISION_REQUIRED_MESSAGE = 'Pour terminer la revue, indiquez la décision que vous prenez pour le mois prochain (une seule suffit).';

export function tooLongMessage(): string {
  return `Ce texte est trop long : ${MAX_REVIEW_ANSWER_LENGTH} caractères au plus.`;
}

export function reviewToForm(review: Pick<MonthlyReview, 'answers'>): ReviewAnswers {
  return { ...review.answers };
}

export function answersEqual(a: ReviewAnswers, b: ReviewAnswers): boolean {
  return REVIEW_FIELDS.every((field) => a[field] === b[field]);
}

/** « 120 / 500 » */
export function describeCounter(text: string): string {
  return `${text.length} / ${MAX_REVIEW_ANSWER_LENGTH}`;
}

export function remainingCharacters(text: string): number {
  return MAX_REVIEW_ANSWER_LENGTH - text.length;
}

/**
 * Prépare l'envoi. Un brouillon accepte des réponses vides ou partielles ; terminer exige une décision.
 * Les réponses sont envoyées telles quelles (seuls les blancs en début et fin sont retirés).
 */
export function buildReviewPayload(values: ReviewAnswers, complete: boolean): ReviewFormResult {
  const errors: ReviewFormErrors = {};
  for (const field of REVIEW_FIELDS) {
    if (values[field].length > MAX_REVIEW_ANSWER_LENGTH) {
      errors[field] = tooLongMessage();
    }
  }
  if (complete && values.decision.trim() === '' && !errors.decision) {
    errors.decision = DECISION_REQUIRED_MESSAGE;
  }
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    payload: {
      answers: { wentWell: values.wentWell.trim(), surprise: values.surprise.trim(), decision: values.decision.trim() },
      complete,
    },
  };
}
