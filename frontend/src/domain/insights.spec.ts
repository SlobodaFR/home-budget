import { describe, expect, it } from 'vitest';
import { insightAction, lessonReference, MAX_INSIGHTS, parseInsights } from './insights';

const raw = (overrides: Record<string, unknown> = {}) => ({
  id: 'recurring-missing',
  severity: 'ACTION',
  title: '2 paiements récurrents introuvables',
  detail: 'Importez votre relevé.',
  lesson: 4,
  link: '/import',
  ...overrides,
});

describe('parseInsights', () => {
  it('reads the contract shape', () => {
    expect(parseInsights({ insights: [raw()] })).toEqual([
      {
        id: 'recurring-missing',
        severity: 'ACTION',
        title: '2 paiements récurrents introuvables',
        detail: 'Importez votre relevé.',
        lesson: 4,
        link: '/import',
      },
    ]);
  });

  it('keeps at most 8 items', () => {
    const insights = Array.from({ length: 12 }, (_, index) => raw({ id: `i-${index}` }));
    expect(parseInsights({ insights })).toHaveLength(MAX_INSIGHTS);
  });

  it.each([null, undefined, 'oops', {}, { insights: 'x' }])('returns nothing for a malformed body (%s)', (body) => {
    expect(parseInsights(body)).toEqual([]);
  });

  it('skips unreadable entries and falls back on safe defaults', () => {
    const result = parseInsights({
      insights: [null, 42, { title: 'sans id' }, raw({ severity: 'WEIRD', lesson: 'x', link: 3, detail: undefined })],
    });
    expect(result).toEqual([
      { id: 'recurring-missing', severity: 'INFO', title: '2 paiements récurrents introuvables', detail: '', lesson: null, link: null },
    ]);
  });

  it('turns a null lesson and link into null', () => {
    expect(parseInsights({ insights: [raw({ lesson: null, link: null })] })[0]).toMatchObject({ lesson: null, link: null });
  });
});

describe('insightAction for the savings projects insights', () => {
  it('offers « Voir mes projets » for the project insights', () => {
    expect(insightAction('/projets', 'project-behind')).toEqual({ to: '/projets', label: 'Voir mes projets' });
    expect(insightAction('/projets', 'project-reached')).toEqual({ to: '/projets', label: 'Voir mes projets' });
    expect(insightAction('/projets')).toEqual({ to: '/projets', label: 'Voir mes projets' });
  });

  it('offers « Ajuster mon plan » when the projects exceed the planned savings', () => {
    expect(insightAction('/plan', 'projects-exceed-savings')).toEqual({ to: '/plan', label: 'Ajuster mon plan' });
  });
});

describe('insightAction for the non monthly payments insights', () => {
  it('opens the provisions tab for an upcoming big payment', () => {
    expect(insightAction('/previsionnel', 'upcoming-big-payment')).toEqual({ to: '/previsionnel?vue=provisions', label: 'Voir mes provisions' });
  });

  it('offers to adjust the plan for a provision suggestion', () => {
    expect(insightAction('/plan', 'provision-suggestion')).toEqual({ to: '/plan', label: 'Ajuster mon plan' });
  });

  it('falls back to the generic button when the server links elsewhere or the id is another one', () => {
    expect(insightAction('/aides', 'upcoming-big-payment')).toEqual({ to: '/aides', label: 'Voir les aides' });
    expect(insightAction('/previsionnel', 'recurring-missing')).toEqual({ to: '/previsionnel', label: 'Voir le prévisionnel' });
    expect(insightAction('/previsionnel', 'constructor')).toEqual({ to: '/previsionnel', label: 'Voir le prévisionnel' });
  });
});

describe('insightAction', () => {
  it.each([
    ['/plan', 'Ouvrir le plan'],
    ['/import', 'Importer un relevé'],
    ['/foyer', 'Ouvrir le foyer'],
    ['/previsionnel', 'Voir le prévisionnel'],
    ['/comptes', 'Voir mes comptes'],
  ])('maps %s to a labelled button', (link, label) => {
    expect(insightAction(link)).toEqual({ to: link, label });
  });

  it('has no button for the home page, for null or for unknown routes', () => {
    expect(insightAction('/')).toBeNull();
    expect(insightAction(null)).toBeNull();
    expect(insightAction('https://evil.example')).toBeNull();
    expect(insightAction('/constructor')).toBeNull();
  });
});

describe('lessonReference', () => {
  it('only mentions the lesson when no course URL is known', () => {
    expect(lessonReference(4, null)).toEqual({ label: 'Leçon 4 du cours', href: null });
  });

  it('links to the lesson when a URL template exists', () => {
    expect(lessonReference(4, 'https://cours.example/lecon-{n}')).toEqual({
      label: 'Voir la leçon 4',
      href: 'https://cours.example/lecon-4',
    });
  });
});
