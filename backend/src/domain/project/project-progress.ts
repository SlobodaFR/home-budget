import { DAY_MS, startOfUtcDay } from '../shared/calendar';
import { roundDiv } from '../shared/rounding';
import { wholeMonthsBetween } from '../budget/provisions';
import { Project } from './project';
import { ProjectDeposit } from './project-deposit';

export type ProjectStatus = 'DONE' | 'LATE' | 'AHEAD' | 'BEHIND' | 'ON_TRACK';

/** Écart toléré avant d'être « en avance » ou « en retard » : 5 % de l'objectif. */
export const STATUS_TOLERANCE_PERCENT = 5;

export interface ProjectView {
  project: Project;
  savedCents: number;
  remainingCents: number;
  progressPercent: number;
  monthsLeft: number;
  monthlyNeededCents: number;
  status: ProjectStatus;
  expectedSavedCents: number;
  /**
   * AAAA-MM-JJ où l'objectif a été atteint (et jamais perdu depuis), null si
   * non atteint : sert à `project-reached`, pas exposé par l'API.
   */
  reachedOn: string | null;
}

const toDay = (iso: string): number => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;

/** Somme `start + versements` ; peut être négative seulement pour des données incohérentes. */
export function savedCents(
  project: Project,
  deposits: ProjectDeposit[],
): number {
  return deposits.reduce((sum, d) => sum + d.amountCents, project.startCents);
}

/**
 * Épargne attendue à `today` sur une progression linéaire de `startDate` à
 * `targetDate` (jours entiers, arrondi au plus proche), de `startCents` à
 * `targetCents`, bornée entre les deux. Un projet déjà financé au départ
 * (`startCents` >= objectif) attend l'objectif.
 */
export function expectedSavedCents(project: Project, today: Date): number {
  const start = project.startCents;
  const target = project.targetCents;
  if (start >= target) {
    return target;
  }
  const total = toDay(project.targetDate) - toDay(project.startDate);
  const elapsed = Math.min(
    Math.max(
      Math.round(startOfUtcDay(today).getTime() / DAY_MS) -
        toDay(project.startDate),
      0,
    ),
    total,
  );
  return start + roundDiv((target - start) * elapsed, total);
}

/**
 * Date à laquelle l'objectif a été atteint pour de bon : on rejoue les
 * versements par date (puis par identifiant) ; chaque fois que le cumul passe
 * de sous l'objectif à l'objectif ou plus, on retient la date de ce versement ;
 * un retrait qui repasse sous l'objectif l'efface. Un projet financé dès le
 * départ est atteint à `startDate`. Null si l'objectif n'est pas atteint.
 */
export function reachedOn(
  project: Project,
  deposits: ProjectDeposit[],
): string | null {
  let cumulative = project.startCents;
  let reached: string | null =
    cumulative >= project.targetCents ? project.startDate : null;
  const ordered = [...deposits].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  for (const deposit of ordered) {
    const before = cumulative;
    cumulative += deposit.amountCents;
    if (cumulative >= project.targetCents) {
      if (before < project.targetCents) {
        reached = deposit.date;
      }
    } else {
      reached = null;
    }
  }
  return cumulative >= project.targetCents ? reached : null;
}

/** Tout en entiers : aucun flottant. */
export function buildProjectView(
  project: Project,
  deposits: ProjectDeposit[],
  todayInstant: Date,
): ProjectView {
  const today = startOfUtcDay(todayInstant);
  const todayIso = today.toISOString().slice(0, 10);
  const saved = Math.max(0, savedCents(project, deposits));
  const target = project.targetCents;
  const remaining = Math.max(0, target - saved);
  const done = saved >= target;

  // Mois entiers jusqu'à l'échéance ; 0 si elle est passée ou dans le mois.
  const monthsLeft =
    project.targetDate > todayIso
      ? Math.max(
          0,
          wholeMonthsBetween(
            today,
            new Date(`${project.targetDate}T00:00:00Z`),
          ),
        )
      : 0;
  const divisor = Math.max(1, monthsLeft);
  const monthlyNeededCents = done
    ? 0
    : Math.floor((remaining + divisor - 1) / divisor);
  const expected = expectedSavedCents(project, today);

  let status: ProjectStatus;
  if (done) {
    status = 'DONE';
  } else if (todayIso > project.targetDate) {
    status = 'LATE';
  } else if ((saved - expected) * 100 >= STATUS_TOLERANCE_PERCENT * target) {
    status = 'AHEAD';
  } else if ((expected - saved) * 100 > STATUS_TOLERANCE_PERCENT * target) {
    status = 'BEHIND';
  } else {
    status = 'ON_TRACK';
  }

  return {
    project,
    savedCents: saved,
    remainingCents: remaining,
    progressPercent: done ? 100 : Math.floor((saved * 100) / target),
    monthsLeft,
    monthlyNeededCents,
    status,
    expectedSavedCents: expected,
    reachedOn: done ? reachedOn(project, deposits) : null,
  };
}

/** Vues de tous les projets d'un espace : non archivés d'abord, puis échéance croissante. */
export function buildProjectViews(
  projects: Project[],
  deposits: ProjectDeposit[],
  today: Date,
): ProjectView[] {
  return projects
    .map((project) =>
      buildProjectView(
        project,
        deposits.filter((d) => d.projectId === project.id),
        today,
      ),
    )
    .sort(
      (a, b) =>
        Number(a.project.archived) - Number(b.project.archived) ||
        a.project.targetDate.localeCompare(b.project.targetDate) ||
        a.project.name.localeCompare(b.project.name, 'fr') ||
        a.project.id.localeCompare(b.project.id),
    );
}

export interface ProjectsSummary {
  totalMonthlyNeededCents: number;
  plannedEpargneCents: number;
  gapCents: number;
  activeCount: number;
}

/**
 * Besoin mensuel de tous les projets non archivés et non atteints (les « actifs »,
 * comptés dans `activeCount`) comparé au bloc EPARGNE prévu du plan.
 */
export function summarizeProjects(
  views: ProjectView[],
  plannedEpargneCents: number,
): ProjectsSummary {
  const active = views.filter(
    (v) => !v.project.archived && v.status !== 'DONE',
  );
  const total = active.reduce((sum, v) => sum + v.monthlyNeededCents, 0);
  return {
    totalMonthlyNeededCents: total,
    plannedEpargneCents,
    gapCents: Math.max(0, total - plannedEpargneCents),
    activeCount: active.length,
  };
}
