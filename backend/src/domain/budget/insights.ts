import { Bloc } from '../shared/bloc';
import { DAY_MS, startOfUtcDay } from '../shared/calendar';
import {
  formatEuros,
  formatMonthLabel,
  formatShortDate,
  formatTenths,
  plural,
  previousMonth,
} from '../shared/format';
import { SafetyNetProgress } from '../safety-net/safety-net-coverage';
import { SpacePlan } from '../space/space-plan';
import { currentMonth } from './month';
import { Forecast, Occurrence, monthPhase } from './forecast';
import { MonthSummary } from './month-summary';

export type InsightSeverity = 'WARNING' | 'ACTION' | 'INFO' | 'GOOD';

export interface Insight {
  id: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
  /** Numéro de la leçon du cours qui explique la règle. */
  lesson: number | null;
  /** Route de l'application où agir. */
  link: string | null;
}

export const MAX_INSIGHTS = 8;

/** Au-delà de ce nombre de jours sans opération, on invite à importer le relevé. */
export const STALE_ACTIVITY_DAYS = 10;
/** Fenêtre des « paiements à venir ». */
export const UPCOMING_DAYS = 7;
/** Jusqu'à ce jour du mois (inclus), on propose le bilan du mois précédent. */
export const REVIEW_LAST_DAY = 7;

/**
 * Leçons du cours de finances familiales auxquelles renvoient les conseils.
 * Aucun conseil de placement : uniquement budget, épargne de sécurité et suivi.
 */
const LESSON_BLOCS = 1;
const LESSON_SAFETY_NET = 2;
const LESSON_TRACKING = 4;

export interface SafetyNetStatus extends SafetyNetProgress {
  targetMonths: number;
}

/** Données propres à l'espace commun (absentes pour un espace personnel). */
export interface CommonInsightsContext {
  /** null = épargne de sécurité non renseignée. */
  safetyNet: SafetyNetStatus | null;
  /** Vrai si le revenu d'un membre manque. */
  contributionIncomplete: boolean;
}

export interface InsightsInput {
  month: string;
  today: Date;
  plan: SpacePlan;
  summary: MonthSummary;
  forecast: Forecast;
  /** Date de la dernière opération de l'espace, tous mois confondus. */
  lastActivity: Date | null;
  /** null pour un espace personnel. */
  common: CommonInsightsContext | null;
}

const SEVERITY_RANK: Record<InsightSeverity, number> = {
  WARNING: 0,
  ACTION: 1,
  INFO: 2,
  GOOD: 3,
};

/** Ordre d'importance à gravité égale (le plus important d'abord). */
const PRIORITY = [
  'plan-overcommitted',
  'month-deficit',
  'bloc-overrun',
  'recurring-missing',
  'plan-missing',
  'plan-unassigned',
  'contribution-incomplete',
  'savings-behind',
  'no-recent-activity',
  'upcoming-payments',
  'monthly-review',
  'safety-net-unset',
  'safety-net-progress',
  'savings-on-track',
  'all-good',
];

function priorityOf(id: string): number {
  const index = PRIORITY.findIndex(
    (prefix) => id === prefix || id.startsWith(`${prefix}-`),
  );
  return index === -1 ? PRIORITY.length : index;
}

const BLOC_LABELS: Record<Bloc, string> = {
  FIXE: 'Fixe',
  COURANT: 'Courant',
  PLAISIR: 'Plaisir',
  EPARGNE: 'Épargne',
};

/**
 * Conseils déterministes, du plus important au moins important, 8 au plus.
 * Fonction pure : mêmes entrées, mêmes conseils.
 */
export function buildInsights(input: InsightsInput): Insight[] {
  const insights: Insight[] = [
    ...planInsights(input),
    ...monthInsights(input),
    ...savingsInsights(input),
    ...trackingInsights(input),
    ...(input.common ? commonInsights(input, input.common) : []),
  ];

  if (insights.length === 0) {
    insights.push({
      id: 'all-good',
      severity: 'GOOD',
      title: 'Tout est en ordre',
      detail:
        "Votre budget est à jour et aucun point d'attention ce mois-ci. Continuez à importer votre relevé régulièrement.",
      lesson: LESSON_TRACKING,
      link: null,
    });
  }

  return insights
    .map((insight, index) => ({ insight, index }))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.insight.severity] - SEVERITY_RANK[b.insight.severity] ||
        priorityOf(a.insight.id) - priorityOf(b.insight.id) ||
        a.index - b.index,
    )
    .map(({ insight }) => insight)
    .slice(0, MAX_INSIGHTS);
}

function planIsEmpty(plan: SpacePlan): boolean {
  return plan.incomeCents === 0 && plan.totalBlocsCents === 0;
}

function planInsights({ plan }: InsightsInput): Insight[] {
  if (planIsEmpty(plan)) {
    return [
      {
        id: 'plan-missing',
        severity: 'ACTION',
        title: 'Aucun plan défini',
        detail:
          'Fixez vos revenus prévus et le montant de chaque bloc (fixe, courant, plaisir, épargne) pour comparer le prévu au réel.',
        lesson: LESSON_BLOCS,
        link: '/plan',
      },
    ];
  }
  const result: Insight[] = [];
  const blocs = plan.totalBlocsCents;
  if (plan.incomeCents > 0 && blocs > plan.incomeCents) {
    const missing = blocs - plan.incomeCents;
    result.push({
      id: 'plan-overcommitted',
      severity: 'WARNING',
      title: 'Votre plan dépense plus que vos revenus',
      detail: `Les 4 blocs totalisent ${formatEuros(blocs)} pour ${formatEuros(plan.incomeCents)} de revenus prévus : il manque ${formatEuros(missing)}. Réduisez un bloc ou revoyez vos revenus.`,
      lesson: LESSON_BLOCS,
      link: '/plan',
    });
  }
  if (plan.incomeCents > blocs) {
    const free = plan.incomeCents - blocs;
    result.push({
      id: 'plan-unassigned',
      severity: 'ACTION',
      title: `${formatEuros(free)} de revenus non affectés`,
      detail: `Chaque euro de revenu prévu doit avoir un rôle : répartissez ces ${formatEuros(free)} entre vos 4 blocs.`,
      lesson: LESSON_BLOCS,
      link: '/plan',
    });
  }
  return result;
}

function monthInsights(input: InsightsInput): Insight[] {
  const { month, today, plan, summary, forecast } = input;
  const phase = monthPhase(month, today);
  const result: Insight[] = [];

  const income = forecast.income.projectedCents;
  const out = forecast.blocs.reduce((sum, b) => sum + b.projectedCents, 0);
  if (forecast.projectedBalanceCents < 0 && (income > 0 || phase === 'PAST')) {
    const deficit = -forecast.projectedBalanceCents;
    result.push({
      id: 'month-deficit',
      severity: 'WARNING',
      title:
        phase === 'PAST'
          ? `Déficit de ${formatEuros(deficit)} en ${formatMonthLabel(month)}`
          : `Déficit de ${formatEuros(deficit)} attendu ce mois-ci`,
      detail: `Revenus ${formatEuros(income)}, dépenses ${formatEuros(out)}${phase === 'PAST' ? '' : ' (réelles et paiements récurrents attendus)'}. Réduisez un bloc ou décalez une dépense.`,
      lesson: LESSON_BLOCS,
      link: '/previsionnel',
    });
  }

  if (!planIsEmpty(plan)) {
    for (const bloc of summary.blocs) {
      if (bloc.bloc === 'EPARGNE' || bloc.actualCents <= bloc.plannedCents) {
        continue;
      }
      result.push({
        id: `bloc-overrun-${bloc.bloc}`,
        severity: 'WARNING',
        title: `Bloc ${BLOC_LABELS[bloc.bloc]} dépassé de ${formatEuros(bloc.gapCents)}`,
        detail: `${formatEuros(bloc.actualCents)} dépensés pour ${formatEuros(bloc.plannedCents)} prévus. Ralentissez sur ce bloc ou ajustez le plan s'il est irréaliste.`,
        lesson: LESSON_BLOCS,
        link: '/plan',
      });
    }
  }
  return result;
}

function savingsInsights(input: InsightsInput): Insight[] {
  const { month, today, plan, forecast } = input;
  if (
    planIsEmpty(plan) ||
    plan.epargneCents === 0 ||
    monthPhase(month, today) === 'FUTURE'
  ) {
    return [];
  }
  const epargne = forecast.blocs.find((b) => b.bloc === 'EPARGNE')!;
  const planned = plan.epargneCents;
  if (epargne.projectedCents >= planned) {
    return [
      {
        id: 'savings-on-track',
        severity: 'GOOD',
        title: 'Épargne dans la cible',
        detail: `${formatEuros(epargne.projectedCents)} épargnés ou programmés sur ${formatEuros(planned)} prévus.`,
        lesson: LESSON_BLOCS,
        link: null,
      },
    ];
  }
  return [
    {
      id: 'savings-behind',
      severity: 'ACTION',
      title: 'Épargne en retard',
      detail: `${formatEuros(epargne.projectedCents)} épargnés ou programmés pour ${formatEuros(planned)} prévus : il manque ${formatEuros(planned - epargne.projectedCents)}. Mettez cet argent de côté dès la réception du revenu.`,
      lesson: LESSON_BLOCS,
      link: '/previsionnel',
    },
  ];
}

function trackingInsights(input: InsightsInput): Insight[] {
  const { month, today, summary, forecast, lastActivity } = input;
  const result: Insight[] = [];
  const todayStart = startOfUtcDay(today);

  const missing = forecast.occurrences.filter((o) => o.status === 'MISSING');
  if (missing.length > 0) {
    result.push({
      id: 'recurring-missing',
      severity: 'ACTION',
      title: `${missing.length} ${plural(missing.length, 'paiement récurrent introuvable', 'paiements récurrents introuvables')}`,
      detail: `${listOccurrences(missing)} ${plural(missing.length, 'est attendu mais absent', 'sont attendus mais absents')} des opérations. Importez votre relevé.`,
      lesson: LESSON_TRACKING,
      link: '/import',
    });
  }

  const windowEnd = todayStart.getTime() + UPCOMING_DAYS * DAY_MS;
  const upcoming = forecast.occurrences.filter(
    (o) =>
      o.status === 'DUE' &&
      o.kind === 'EXPENSE' &&
      o.date.getTime() >= todayStart.getTime() &&
      o.date.getTime() <= windowEnd,
  );
  if (upcoming.length > 0) {
    const total = upcoming.reduce((sum, o) => sum + o.amountCents, 0);
    result.push({
      id: 'upcoming-payments',
      severity: 'INFO',
      title: `${upcoming.length} ${plural(upcoming.length, 'paiement à venir', 'paiements à venir')} dans les ${UPCOMING_DAYS} jours`,
      detail: `${listOccurrences(upcoming, true)}. Total : ${formatEuros(total)}. Gardez ce montant disponible.`,
      lesson: LESSON_TRACKING,
      link: '/previsionnel',
    });
  }

  if (monthPhase(month, today) === 'CURRENT') {
    if (lastActivity === null) {
      result.push({
        id: 'no-recent-activity',
        severity: 'ACTION',
        title: 'Aucune opération enregistrée',
        detail:
          'Importez votre relevé bancaire pour suivre vos dépenses et comparer le réel au plan.',
        lesson: LESSON_TRACKING,
        link: '/import',
      });
    } else {
      const days = Math.floor(
        (todayStart.getTime() - startOfUtcDay(lastActivity).getTime()) / DAY_MS,
      );
      if (days > STALE_ACTIVITY_DAYS) {
        result.push({
          id: 'no-recent-activity',
          severity: 'ACTION',
          title: `Aucune opération depuis ${days} jours`,
          detail:
            'Importez votre relevé bancaire pour garder le suivi à jour : un budget suivi une fois par mois suffit, mais il faut le faire.',
          lesson: LESSON_TRACKING,
          link: '/import',
        });
      }
    }
  }

  const review = monthlyReview(month, today, summary);
  if (review) {
    result.push(review);
  }
  return result;
}

/**
 * Bilan mensuel : pendant la première semaine d'un mois, on invite à faire le
 * bilan du mois précédent (depuis le mois en cours) ou on le résume (depuis le
 * mois précédent lui-même).
 */
function monthlyReview(
  month: string,
  today: Date,
  summary: MonthSummary,
): Insight | null {
  if (today.getUTCDate() > REVIEW_LAST_DAY) {
    return null;
  }
  const current = currentMonth(today);
  const previous = previousMonth(current);
  if (month === current) {
    return {
      id: 'monthly-review',
      severity: 'INFO',
      title: `Faites le bilan de ${formatMonthLabel(previous)}`,
      detail: `Le mois commence : comparez le prévu et le réel de ${formatMonthLabel(previous)}, puis ajustez votre plan si besoin.`,
      lesson: LESSON_TRACKING,
      link: '/',
    };
  }
  if (month === previous) {
    const out = summary.blocs.reduce((sum, b) => sum + b.actualCents, 0);
    return {
      id: 'monthly-review',
      severity: 'INFO',
      title: `Bilan de ${formatMonthLabel(month)}`,
      detail: `Revenus ${formatEuros(summary.income.actualCents)}, dépenses ${formatEuros(out)} : solde de ${formatEuros(summary.actualBalanceCents)}. Comparez avec votre plan et ajustez-le si besoin.`,
      lesson: LESSON_TRACKING,
      link: '/',
    };
  }
  return null;
}

function commonInsights(
  input: InsightsInput,
  common: CommonInsightsContext,
): Insight[] {
  const result: Insight[] = [];

  if (common.contributionIncomplete) {
    result.push({
      id: 'contribution-incomplete',
      severity: 'ACTION',
      title: 'Revenus du foyer incomplets',
      detail:
        "Il manque le revenu net d'au moins un membre : la part de chacun dans le budget commun ne peut pas être calculée.",
      lesson: null,
      link: '/foyer',
    });
  }

  if (common.safetyNet === null) {
    result.push({
      id: 'safety-net-unset',
      severity: 'INFO',
      title: 'Épargne de sécurité non renseignée',
      detail:
        "Indiquez ce que le foyer a de côté pour les coups durs et le nombre de mois de dépenses visé : l'application suivra votre progression.",
      lesson: LESSON_SAFETY_NET,
      link: '/foyer',
    });
    return result;
  }

  const { currentCents, targetMonths, monthlyBasisCents, coveredMonths } =
    common.safetyNet;
  if (coveredMonths === null) {
    result.push({
      id: 'safety-net-progress',
      severity: 'INFO',
      title: `Épargne de sécurité : ${formatEuros(currentCents)} de côté`,
      detail:
        'Renseignez les blocs fixe et courant du plan commun pour mesurer cette réserve en mois de dépenses.',
      lesson: LESSON_SAFETY_NET,
      link: '/plan',
    });
    return result;
  }
  const targetCents = targetMonths * monthlyBasisCents;
  const reached = currentCents >= targetCents;
  // Jamais « objectif atteint » à l'affichage tant qu'il ne l'est pas : on plafonne l'arrondi.
  const tenths = reached
    ? Math.round(coveredMonths * 10)
    : Math.min(Math.round(coveredMonths * 10), targetMonths * 10 - 1);
  result.push({
    id: 'safety-net-progress',
    severity: reached ? 'GOOD' : 'INFO',
    title: `Épargne de sécurité : ${formatTenths(tenths)} mois sur ${targetMonths}`,
    detail: reached
      ? `Votre réserve de ${formatEuros(currentCents)} couvre ${formatTenths(tenths)} mois de dépenses essentielles (${formatEuros(monthlyBasisCents)} par mois) : l'objectif de ${targetMonths} mois est atteint.`
      : `Votre réserve de ${formatEuros(currentCents)} couvre ${formatTenths(tenths)} mois de dépenses essentielles (${formatEuros(monthlyBasisCents)} par mois). Il manque ${formatEuros(targetCents - currentCents)} pour atteindre ${targetMonths} mois.`,
    lesson: LESSON_SAFETY_NET,
    link: '/foyer',
  });
  return result;
}

const MAX_LISTED = 3;

/** « Loyer (5 nov.) et Assurance (8 nov.) » ; avec montants, « Loyer (5 nov., 1 100 €) ». */
function listOccurrences(
  occurrences: Occurrence[],
  withAmount = false,
): string {
  const names = occurrences
    .slice(0, MAX_LISTED)
    .map(
      (o) =>
        `${o.label} (${formatShortDate(o.date)}${withAmount ? `, ${formatEuros(o.amountCents)}` : ''})`,
    );
  const others = occurrences.length - names.length;
  if (others > 0) {
    names.push(`${others} ${plural(others, 'autre', 'autres')}`);
  }
  if (names.length === 1) {
    return names[0];
  }
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}
