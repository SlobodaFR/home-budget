export type InsightSeverity = 'WARNING' | 'ACTION' | 'INFO' | 'GOOD';

export interface Insight {
  id: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
  lesson: number | null;
  link: string | null;
}

export const MAX_INSIGHTS = 8;

export const SEVERITIES: readonly InsightSeverity[] = ['WARNING', 'ACTION', 'INFO', 'GOOD'];

export const SEVERITY_LABEL: Record<InsightSeverity, string> = {
  WARNING: 'Attention',
  ACTION: 'À faire',
  INFO: 'Bon à savoir',
  GOOD: 'Bien joué',
};

/**
 * Adresse d'une leçon du cours, avec `{n}` pour le numéro de la leçon.
 * Aucune page publique n'est connue pour l'instant : tant que c'est `null`, on se contente de citer la leçon.
 */
export const COURSE_LESSON_URL_TEMPLATE: string | null = null;

export interface LessonReference {
  label: string;
  href: string | null;
}

export function lessonReference(lesson: number, template: string | null = COURSE_LESSON_URL_TEMPLATE): LessonReference {
  if (template) {
    return { label: `Voir la leçon ${lesson}`, href: template.replace('{n}', String(lesson)) };
  }
  return { label: `Leçon ${lesson} du cours`, href: null };
}

export interface InsightAction {
  to: string;
  label: string;
}

const ACTION_LABELS: Record<string, string> = {
  '/plan': 'Ouvrir le plan',
  '/import': 'Importer un relevé',
  '/foyer': 'Ouvrir le foyer',
  '/previsionnel': 'Voir le prévisionnel',
  '/comptes': 'Voir mes comptes',
  '/aides': 'Voir les aides',
};

/** Seules les routes connues de l'application sont suivies ; « / » (l'accueil) n'a pas de bouton. */
export function insightAction(link: string | null): InsightAction | null {
  if (link === null || !Object.prototype.hasOwnProperty.call(ACTION_LABELS, link)) {
    return null;
  }
  return { to: link, label: ACTION_LABELS[link] };
}

function isSeverity(value: unknown): value is InsightSeverity {
  return typeof value === 'string' && (SEVERITIES as readonly string[]).includes(value);
}

/** Lit la réponse du serveur sans jamais planter : les éléments illisibles sont ignorés. */
export function parseInsights(raw: unknown): Insight[] {
  const list = (raw as { insights?: unknown } | null | undefined)?.insights;
  if (!Array.isArray(list)) {
    return [];
  }
  const insights: Insight[] = [];
  for (const item of list as unknown[]) {
    const entry = item as Partial<Record<keyof Insight, unknown>> | null;
    if (!entry || typeof entry.id !== 'string' || typeof entry.title !== 'string') {
      continue;
    }
    insights.push({
      id: entry.id,
      severity: isSeverity(entry.severity) ? entry.severity : 'INFO',
      title: entry.title,
      detail: typeof entry.detail === 'string' ? entry.detail : '',
      lesson: typeof entry.lesson === 'number' && Number.isInteger(entry.lesson) && entry.lesson > 0 ? entry.lesson : null,
      link: typeof entry.link === 'string' ? entry.link : null,
    });
  }
  return insights.slice(0, MAX_INSIGHTS);
}
