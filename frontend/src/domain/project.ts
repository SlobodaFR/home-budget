import { formatCentsShort, centsToInputValue, parseAmountToCents } from './money';
import { addMonths, formatDateInput, formatLongDateInput, isValidDateInput, todayInputValue } from './month';

export const MAX_PROJECT_NAME_LENGTH = 80;
export const MAX_DEPOSIT_NOTE_LENGTH = 120;

export type ProjectKind = 'GENERIC' | 'BABY' | 'HOLIDAY' | 'PURCHASE' | 'HOME' | 'EDUCATION' | 'OTHER';
export type ProjectStatus = 'DONE' | 'LATE' | 'AHEAD' | 'BEHIND' | 'ON_TRACK';

export const PROJECT_KINDS: readonly ProjectKind[] = ['GENERIC', 'BABY', 'HOLIDAY', 'PURCHASE', 'HOME', 'EDUCATION', 'OTHER'];

/** Les types proposés dans le formulaire (« Projet » générique n'y figure pas : « Autre » joue ce rôle). */
export const SELECTABLE_KINDS: readonly ProjectKind[] = ['BABY', 'HOLIDAY', 'PURCHASE', 'HOME', 'EDUCATION', 'OTHER'];

export const PROJECT_KIND_LABEL: Record<ProjectKind, string> = {
  GENERIC: 'Projet',
  BABY: 'Naissance',
  HOLIDAY: 'Vacances',
  PURCHASE: 'Achat',
  HOME: 'Maison et travaux',
  EDUCATION: 'Études',
  OTHER: 'Autre',
};

export interface Project {
  id: string;
  spaceId: string;
  name: string;
  kind: ProjectKind;
  targetCents: number;
  /** `AAAA-MM-JJ`. */
  targetDate: string;
  startCents: number;
  startDate: string;
  savedCents: number;
  remainingCents: number;
  progressPercent: number;
  monthsLeft: number;
  monthlyNeededCents: number;
  status: ProjectStatus;
  expectedSavedCents: number;
  archived: boolean;
  accountId: string | null;
}

export interface ProjectPayload {
  name: string;
  kind: ProjectKind;
  targetCents: number;
  targetDate: string;
  startCents: number;
  startDate: string;
  accountId?: string | null;
  archived?: boolean;
}

export interface ProjectsSummary {
  totalMonthlyNeededCents: number;
  plannedEpargneCents: number;
  gapCents: number;
  activeCount: number;
}

export interface Deposit {
  id: string;
  /** `AAAA-MM-JJ`. */
  date: string;
  /** Négatif pour un retrait. */
  amountCents: number;
  note: string;
}

export interface DepositPayload {
  date: string;
  amountCents: number;
  note?: string;
}

// ---------------------------------------------------------------------------------------------------------------------
// Lecture tolérante des réponses du serveur
// ---------------------------------------------------------------------------------------------------------------------

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isDate = (value: unknown): value is string => typeof value === 'string' && isValidDateInput(value.slice(0, 10));

function kindOf(value: unknown): ProjectKind {
  return PROJECT_KINDS.includes(value as ProjectKind) ? (value as ProjectKind) : 'GENERIC';
}

function statusOf(value: unknown, remainingCents: number): ProjectStatus {
  if (value === 'DONE' || value === 'LATE' || value === 'AHEAD' || value === 'BEHIND' || value === 'ON_TRACK') {
    return value;
  }
  return remainingCents <= 0 ? 'DONE' : 'ON_TRACK';
}

/** Lit un projet ; `null` si l'essentiel (id, nom, objectif) manque. Les chiffres absents sont recalculés plutôt que supposés. */
export function parseProject(raw: unknown): Project | null {
  const item = (raw ?? {}) as Record<string, unknown>;
  if (typeof item.id !== 'string' || typeof item.name !== 'string' || !isNumber(item.targetCents)) {
    return null;
  }
  const targetCents = item.targetCents;
  const startCents = isNumber(item.startCents) ? item.startCents : 0;
  const savedCents = isNumber(item.savedCents) ? item.savedCents : startCents;
  const remainingCents = isNumber(item.remainingCents) ? item.remainingCents : Math.max(0, targetCents - savedCents);
  const monthsLeft = isNumber(item.monthsLeft) ? Math.max(0, Math.trunc(item.monthsLeft)) : 0;
  return {
    id: item.id,
    spaceId: typeof item.spaceId === 'string' ? item.spaceId : '',
    name: item.name,
    kind: kindOf(item.kind),
    targetCents,
    targetDate: isDate(item.targetDate) ? item.targetDate.slice(0, 10) : '',
    startCents,
    startDate: isDate(item.startDate) ? item.startDate.slice(0, 10) : '',
    savedCents,
    remainingCents,
    progressPercent: isNumber(item.progressPercent)
      ? Math.min(100, Math.max(0, Math.trunc(item.progressPercent)))
      : targetCents > 0
        ? Math.min(100, Math.max(0, Math.floor((savedCents / targetCents) * 100)))
        : 0,
    monthsLeft,
    monthlyNeededCents: isNumber(item.monthlyNeededCents)
      ? item.monthlyNeededCents
      : remainingCents <= 0
        ? 0
        : Math.ceil(remainingCents / Math.max(1, monthsLeft)),
    status: statusOf(item.status, remainingCents),
    expectedSavedCents: isNumber(item.expectedSavedCents) ? item.expectedSavedCents : savedCents,
    archived: item.archived === true,
    accountId: typeof item.accountId === 'string' ? item.accountId : null,
  };
}

export function parseProjects(raw: unknown): Project[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const projects: Project[] = [];
  for (const entry of raw as unknown[]) {
    const project = parseProject(entry);
    if (project) {
      projects.push(project);
    }
  }
  return sortProjects(projects);
}

export function parseProjectsSummary(raw: unknown): ProjectsSummary {
  const source = (raw ?? {}) as Record<string, unknown>;
  const total = isNumber(source.totalMonthlyNeededCents) ? Math.max(0, source.totalMonthlyNeededCents) : 0;
  const planned = isNumber(source.plannedEpargneCents) ? Math.max(0, source.plannedEpargneCents) : 0;
  return {
    totalMonthlyNeededCents: total,
    plannedEpargneCents: planned,
    gapCents: isNumber(source.gapCents) ? Math.max(0, source.gapCents) : Math.max(0, total - planned),
    activeCount: isNumber(source.activeCount) ? Math.max(0, Math.trunc(source.activeCount)) : 0,
  };
}

export function parseDeposits(raw: unknown): Deposit[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const deposits: Deposit[] = [];
  for (const entry of raw as unknown[]) {
    const item = (entry ?? {}) as Record<string, unknown>;
    if (typeof item.id !== 'string' || !isNumber(item.amountCents) || !isDate(item.date)) {
      continue;
    }
    deposits.push({ id: item.id, date: item.date.slice(0, 10), amountCents: item.amountCents, note: typeof item.note === 'string' ? item.note : '' });
  }
  return sortDeposits(deposits);
}

// ---------------------------------------------------------------------------------------------------------------------
// Tri et regroupement
// ---------------------------------------------------------------------------------------------------------------------

/** Les projets en cours d'abord, puis par échéance croissante (une échéance illisible en dernier). */
export function sortProjects(projects: readonly Project[]): Project[] {
  return [...projects].sort((a, b) => {
    if (a.archived !== b.archived) {
      return a.archived ? 1 : -1;
    }
    if (a.targetDate !== b.targetDate) {
      return a.targetDate === '' ? 1 : b.targetDate === '' ? -1 : a.targetDate < b.targetDate ? -1 : 1;
    }
    return a.name.localeCompare(b.name, 'fr');
  });
}

export const activeProjects = (projects: readonly Project[]): Project[] => projects.filter((project) => !project.archived);
export const archivedProjects = (projects: readonly Project[]): Project[] => projects.filter((project) => project.archived);

/** Les projets à surveiller sur l'accueil : non archivés, pas encore atteints, les plus proches de l'échéance d'abord. */
export function closestProjects(projects: readonly Project[], limit = 3): Project[] {
  return sortProjects(projects)
    .filter((project) => !project.archived && project.status !== 'DONE')
    .slice(0, limit);
}

/** Du plus récent au plus ancien (le serveur trie déjà : on ne s'y fie pas). */
export function sortDeposits(deposits: readonly Deposit[]): Deposit[] {
  return [...deposits].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
}

// ---------------------------------------------------------------------------------------------------------------------
// Libellés
// ---------------------------------------------------------------------------------------------------------------------

export interface StatusInfo {
  label: string;
  description: string;
}

export const STATUS_INFO: Record<ProjectStatus, StatusInfo> = {
  DONE: { label: 'Atteint', description: 'Objectif atteint, bravo !' },
  AHEAD: { label: 'En avance', description: 'Vous avez mis de côté plus que prévu à ce stade.' },
  ON_TRACK: { label: 'À jour', description: 'Vous êtes dans le rythme pour atteindre l’objectif à la date prévue.' },
  BEHIND: { label: 'En retard', description: 'Vous avez mis de côté moins que prévu à ce stade.' },
  LATE: { label: 'En retard sur l’échéance', description: 'La date prévue est passée et l’objectif n’est pas encore atteint.' },
};

/** « 13 % — 400 € sur 3 000 € » : le texte lu par les lecteurs d'écran et affiché sous la barre. */
export function describeProgress(project: Pick<Project, 'progressPercent' | 'savedCents' | 'targetCents'>): string {
  return `${project.progressPercent} % — ${formatCentsShort(project.savedCents)} sur ${formatCentsShort(project.targetCents)}`;
}

/** Position (0-100) de l'épargne attendue aujourd'hui sur la barre. */
export function expectedPercent(project: Pick<Project, 'expectedSavedCents' | 'targetCents'>): number {
  return project.targetCents > 0 ? Math.min(100, Math.max(0, Math.round((project.expectedSavedCents / project.targetCents) * 100))) : 0;
}

/** Ce qui manque par rapport au rythme prévu (0 si le projet est à jour, en avance ou atteint). */
export function behindCents(project: Pick<Project, 'status' | 'savedCents' | 'expectedSavedCents'>): number {
  return project.status === 'BEHIND' || project.status === 'LATE' ? Math.max(0, project.expectedSavedCents - project.savedCents) : 0;
}

/** « Échéance le 1 juillet 2027 · dans 8 mois », « Échéance dépassée (1 juil. 2027) » ; sans « dans N mois » pour un projet atteint. */
export function describeDeadline(project: Pick<Project, 'targetDate' | 'monthsLeft' | 'status'>): string {
  if (project.targetDate === '') {
    return 'Échéance inconnue';
  }
  if (project.status === 'LATE') {
    return `Échéance dépassée (${formatDateInput(project.targetDate)})`;
  }
  if (project.status === 'DONE') {
    return `Échéance le ${formatLongDateInput(project.targetDate)}`;
  }
  const when = project.monthsLeft <= 0 ? 'ce mois-ci' : `dans ${project.monthsLeft} mois`;
  return `Échéance le ${formatLongDateInput(project.targetDate)} · ${when}`;
}

/** « Il faut mettre de côté 325 € par mois. » */
export function describeMonthlyNeed(project: Pick<Project, 'status' | 'monthlyNeededCents' | 'remainingCents'>): string {
  if (project.status === 'DONE' || project.remainingCents <= 0) {
    return 'Objectif atteint : rien de plus à mettre de côté.';
  }
  if (project.status === 'LATE') {
    return `Il reste ${formatCentsShort(project.remainingCents)} à réunir : faites un versement ou repoussez l’échéance.`;
  }
  return `Il faut mettre de côté ${formatCentsShort(project.monthlyNeededCents)} par mois.`;
}

/** Le calcul, pour qu'il ne soit pas une boîte noire : « (3 000 € − 400 €) ÷ 8 mois = 325 € par mois ». */
export function describeCalculation(project: Pick<Project, 'targetCents' | 'savedCents' | 'remainingCents' | 'monthsLeft' | 'monthlyNeededCents'>): string {
  const months = Math.max(1, project.monthsLeft);
  return `(${formatCentsShort(project.targetCents)} − ${formatCentsShort(project.savedCents)}) ÷ ${months} mois = ${formatCentsShort(project.monthlyNeededCents)} par mois`;
}

export const CALCULATION_REMINDER = 'Chaque mois : (objectif − déjà épargné) ÷ mois restants, arrondi à l’euro supérieur.';

/** Ligne de résumé pour le bandeau en haut de la page ; `null` quand il n'y a rien à dire. */
export function describeSummaryGap(summary: Pick<ProjectsSummary, 'gapCents' | 'activeCount'>): { gap: boolean; text: string } | null {
  if (summary.activeCount <= 0) {
    return null;
  }
  return summary.gapCents > 0
    ? { gap: true, text: `Il manque ${formatCentsShort(summary.gapCents)}/mois dans votre plan d’épargne` }
    : { gap: false, text: 'Votre plan d’épargne couvre vos projets.' };
}

// ---------------------------------------------------------------------------------------------------------------------
// Formulaire de projet
// ---------------------------------------------------------------------------------------------------------------------

export interface ProjectFormValues {
  name: string;
  kind: ProjectKind;
  /** Montant à atteindre, en euros. */
  target: string;
  targetDate: string;
  /** Déjà épargné au départ, en euros ; vide = 0. */
  start: string;
  startDate: string;
  /** Identifiant du compte, ou chaîne vide pour « Aucun ». */
  accountId: string;
}

export interface ProjectFormErrors {
  name?: string;
  target?: string;
  targetDate?: string;
  start?: string;
  startDate?: string;
}

export type ProjectFormResult = { ok: true; payload: ProjectPayload } | { ok: false; errors: ProjectFormErrors };

export const DEFAULT_HORIZON_MONTHS = 12;

export function emptyProjectForm(now: Date = new Date()): ProjectFormValues {
  const startDate = todayInputValue(now);
  return { name: '', kind: 'OTHER', target: '', targetDate: addMonths(startDate, DEFAULT_HORIZON_MONTHS), start: '', startDate, accountId: '' };
}

export function projectToForm(project: Project): ProjectFormValues {
  return {
    name: project.name,
    kind: project.kind,
    target: centsToInputValue(project.targetCents),
    targetDate: project.targetDate,
    start: project.startCents === 0 ? '' : centsToInputValue(project.startCents),
    startDate: project.startDate,
    accountId: project.accountId ?? '',
  };
}

export function buildProjectPayload(values: ProjectFormValues, options: { accountSelectable?: boolean } = {}): ProjectFormResult {
  const errors: ProjectFormErrors = {};

  const name = values.name.trim();
  if (name === '') {
    errors.name = 'Donnez un nom à ce projet (ex. Vacances été 2027).';
  } else if (name.length > MAX_PROJECT_NAME_LENGTH) {
    errors.name = `Le nom est trop long (${MAX_PROJECT_NAME_LENGTH} caractères au plus).`;
  }

  const targetCents = parseAmountToCents(values.target);
  if (values.target.trim() === '') {
    errors.target = 'Indiquez la somme à atteindre.';
  } else if (targetCents === null) {
    errors.target = 'Montant invalide : utilisez des chiffres et au plus 2 décimales (ex. 3 000 ou 450,50).';
  } else if (targetCents === 0) {
    errors.target = 'La somme à atteindre doit être supérieure à 0.';
  }

  const startCents = values.start.trim() === '' ? 0 : parseAmountToCents(values.start);
  if (startCents === null) {
    errors.start = 'Montant invalide : utilisez des chiffres et au plus 2 décimales, ou laissez vide si vous partez de zéro.';
  }

  if (!isValidDateInput(values.startDate)) {
    errors.startDate = 'Choisissez une date de départ valide.';
  }
  if (!isValidDateInput(values.targetDate)) {
    errors.targetDate = 'Choisissez une échéance valide.';
  } else if (!errors.startDate && values.targetDate <= values.startDate) {
    errors.targetDate = 'L’échéance doit être après la date de départ.';
  }

  if (Object.keys(errors).length > 0 || targetCents === null || startCents === null) {
    return { ok: false, errors };
  }

  const payload: ProjectPayload = {
    name,
    kind: values.kind,
    targetCents,
    targetDate: values.targetDate,
    startCents,
    startDate: values.startDate,
  };
  if (values.accountId !== '') {
    payload.accountId = values.accountId;
  } else if (options.accountSelectable) {
    payload.accountId = null;
  }
  return { ok: true, payload };
}

export function projectToPayload(project: Project, overrides: Partial<ProjectPayload> = {}): ProjectPayload {
  return {
    name: project.name,
    kind: project.kind,
    targetCents: project.targetCents,
    targetDate: project.targetDate,
    startCents: project.startCents,
    startDate: project.startDate,
    accountId: project.accountId,
    archived: project.archived,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Formulaire de versement
// ---------------------------------------------------------------------------------------------------------------------

export type DepositMode = 'ADD' | 'WITHDRAW';

export interface DepositFormValues {
  mode: DepositMode;
  /** Toujours positif : c'est le mode qui donne le sens. */
  amount: string;
  date: string;
  note: string;
}

export interface DepositFormErrors {
  amount?: string;
  date?: string;
  note?: string;
}

export type DepositFormResult = { ok: true; payload: DepositPayload } | { ok: false; errors: DepositFormErrors };

export const DEPOSIT_MODE_LABEL: Record<DepositMode, string> = { ADD: 'Ajouter', WITHDRAW: 'Retirer' };

export function emptyDepositForm(now: Date = new Date()): DepositFormValues {
  return { mode: 'ADD', amount: '', date: todayInputValue(now), note: '' };
}

/** `savedCents` : ce qui est épargné aujourd'hui, pour refuser un retrait plus gros avant d'appeler le serveur. */
export function buildDepositPayload(values: DepositFormValues, options: { savedCents?: number } = {}): DepositFormResult {
  const errors: DepositFormErrors = {};

  const cents = parseAmountToCents(values.amount);
  if (values.amount.trim() === '') {
    errors.amount = 'Saisissez un montant.';
  } else if (cents === null) {
    errors.amount = 'Montant invalide : utilisez des chiffres et au plus 2 décimales (ex. 200 ou 12,50). Pour un retrait, choisissez « Retirer ».';
  } else if (cents === 0) {
    errors.amount = 'Le montant doit être supérieur à 0.';
  } else if (values.mode === 'WITHDRAW' && options.savedCents !== undefined && cents > options.savedCents) {
    errors.amount = `Vous ne pouvez pas retirer plus que ce qui est épargné (${formatCentsShort(Math.max(0, options.savedCents))}).`;
  }

  if (!isValidDateInput(values.date)) {
    errors.date = 'Choisissez une date valide.';
  }

  const note = values.note.trim();
  if (note.length > MAX_DEPOSIT_NOTE_LENGTH) {
    errors.note = `La note est trop longue (${MAX_DEPOSIT_NOTE_LENGTH} caractères au plus).`;
  }

  if (Object.keys(errors).length > 0 || cents === null) {
    return { ok: false, errors };
  }
  const payload: DepositPayload = { date: values.date, amountCents: values.mode === 'WITHDRAW' ? -cents : cents };
  if (note !== '') {
    payload.note = note;
  }
  return { ok: true, payload };
}

export const isWithdrawal = (deposit: Pick<Deposit, 'amountCents'>): boolean => deposit.amountCents < 0;
