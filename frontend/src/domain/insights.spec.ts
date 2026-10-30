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

describe('insightAction for the monthly review insights', () => {
  it('offers « Faire ma revue » for the pending review', () => {
    expect(insightAction('/revue', 'monthly-review')).toEqual({ to: '/revue', label: 'Faire ma revue' });
    expect(insightAction('/revue')).toEqual({ to: '/revue', label: 'Faire ma revue' });
  });

  it('offers « Voir ma revue » once it is done', () => {
    expect(insightAction('/revue', 'review-done')).toEqual({ to: '/revue', label: 'Voir ma revue' });
  });

  it('keeps the generic label when the server sends another link for review-done', () => {
    expect(insightAction('/plan', 'review-done')).toEqual({ to: '/plan', label: 'Ouvrir le plan' });
  });
});

describe('insightAction for the spending-riser insight', () => {
  it('offers « Voir mes démarches » for the life event insights', () => {
    expect(insightAction('/evenements', 'life-event-overdue')).toEqual({ to: '/evenements', label: 'Voir mes démarches' });
    expect(insightAction('/evenements', 'life-event-due-soon')).toEqual({ to: '/evenements', label: 'Voir mes démarches' });
  });

  it('offers « Voir mes tendances »', () => {
    expect(insightAction('/tendances', 'spending-riser')).toEqual({ to: '/tendances', label: 'Voir mes tendances' });
  });
});

describe('insightAction for the pending contribution insight', () => {
  it('offers « Verser ma contribution » and opens the contribution card', () => {
    expect(insightAction('/foyer', 'contribution-pending')).toEqual({ to: '/foyer?verser=1', label: 'Verser ma contribution' });
  });

  it('keeps the generic label for other foyer insights and for another link', () => {
    expect(insightAction('/foyer', 'safety-net-unset')).toEqual({ to: '/foyer', label: 'Ouvrir le foyer' });
    expect(insightAction('/foyer')).toEqual({ to: '/foyer', label: 'Ouvrir le foyer' });
    expect(insightAction('/plan', 'contribution-pending')).toEqual({ to: '/plan', label: 'Ouvrir le plan' });
  });
});
