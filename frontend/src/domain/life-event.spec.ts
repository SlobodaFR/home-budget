import { describe, expect, it } from 'vitest';
import { lifeEvent, lifeEventCatalog, lifeEventStep } from '../test/fixtures';
import {
  applyStepChange,
  attachVerification,
  buildLifeEventPayload,
  countByCategory,
  describeDoneAt,
  describeDue,
  describeEventDate,
  describeProgress,
  describeSourceVerification,
  describeUrgency,
  eventDateBounds,
  groupSteps,
  parseCatalog,
  parseLifeEvent,
  parseLifeEvents,
  restoreStep,
  sortSteps,
  stepLinkAction,
  stepStatusFor,
  validateNote,
  withCounts,
} from './life-event';

/** Le 30 octobre 2026, à midi (heure locale). */
const NOW = new Date(2026, 9, 30, 12, 0, 0);

describe('stepStatusFor', () => {
  it('follows the server rules: done wins, no date, overdue strictly before today, due soon within 14 days inclusive', () => {
    expect(stepStatusFor(true, '2026-01-01', NOW)).toBe('DONE');
    expect(stepStatusFor(false, null, NOW)).toBe('NO_DATE');
    expect(stepStatusFor(false, 'pas une date', NOW)).toBe('NO_DATE');
    expect(stepStatusFor(false, '2026-10-29', NOW)).toBe('OVERDUE');
    expect(stepStatusFor(false, '2026-10-30', NOW)).toBe('DUE_SOON');
    expect(stepStatusFor(false, '2026-11-13', NOW)).toBe('DUE_SOON');
    expect(stepStatusFor(false, '2026-11-14', NOW)).toBe('UPCOMING');
  });
});

describe('parseLifeEvents', () => {
  const raw = {
    id: 'e1',
    type: 'BIRTH',
    label: 'Naissance d’un enfant',
    eventDate: '2026-10-31',
    progressPercent: 25,
    doneCount: 3,
    totalCount: 12,
    steps: [
      { stepId: 'a', title: 'A', detail: 'd', category: 'ADMIN', dueDate: '2026-11-05', dueLabel: 'Dans 5 jours', status: 'DUE_SOON', doneAt: null, note: '', sourceLabel: 's', sourceUrl: 'https://x.test', link: null },
    ],
  };

  it('reads a complete event and recomputes the counters from the steps (the steps are the truth)', () => {
    const [event] = parseLifeEvents([raw], NOW);
    expect(event).toMatchObject({ id: 'e1', type: 'BIRTH', eventDate: '2026-10-31', doneCount: 0, totalCount: 1, progressPercent: 0 });
    expect(event.steps[0]).toMatchObject({ stepId: 'a', status: 'DUE_SOON', dueDate: '2026-11-05', verifiedOn: null });
  });

  it('is tolerant: fills in what the server forgot and skips what is unreadable', () => {
    const events = parseLifeEvents(
      [
        { id: 'x', eventDate: '2026-11-01T00:00:00.000Z', steps: [{ stepId: 's1', title: 'Seule', dueDate: '2026-10-01' }, { nope: true }, null, { stepId: 's2', title: 'Faite', doneAt: '2026-10-02T08:00:00.000Z', category: 'INCONNUE' }] },
        { id: 'sans-date' },
        { eventDate: '2026-11-01' },
        'texte',
        null,
      ],
      NOW,
    );
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event).toMatchObject({ label: 'Naissance d’un enfant', type: 'BIRTH', eventDate: '2026-11-01', doneCount: 1, totalCount: 2, progressPercent: 50 });
    expect(event.steps.map((step) => [step.stepId, step.status, step.category])).toEqual([
      ['s1', 'OVERDUE', 'ADMIN'],
      ['s2', 'DONE', 'ADMIN'],
    ]);
    expect(event.steps[0]).toMatchObject({ detail: '', note: '', dueLabel: null, link: null, sourceUrl: '' });
  });

  it('recomputes an unknown status from the due date', () => {
    const [event] = parseLifeEvents([{ id: 'x', eventDate: '2026-11-01', steps: [{ stepId: 'a', title: 'A', dueDate: '2026-11-05', status: 'BIZARRE' }] }], NOW);
    expect(event.steps[0].status).toBe('DUE_SOON');
  });

  it('returns an empty list for anything that is not a list, and sorts newest first', () => {
    expect(parseLifeEvents({ events: [] })).toEqual([]);
    expect(parseLifeEvents(undefined)).toEqual([]);
    const events = parseLifeEvents([{ id: 'old', eventDate: '2026-01-01' }, { id: 'new', eventDate: '2026-10-01' }], NOW);
    expect(events.map((event) => event.id)).toEqual(['new', 'old']);
  });

  it('keeps the verification date when the server does send it', () => {
    const event = parseLifeEvent({ id: 'e', eventDate: '2026-11-01', steps: [{ stepId: 'a', title: 'A', verifiedOn: '2026-10-30' }] }, NOW);
    expect(event?.steps[0].verifiedOn).toBe('2026-10-30');
  });
});

describe('parseCatalog and attachVerification', () => {
  const raw = [
    {
      type: 'BIRTH',
      label: 'Naissance d’un enfant',
      description: 'Les démarches…',
      steps: [
        { id: 'birth-declaration', title: 'Déclarer', detail: 'd', category: 'ADMIN', dueOffsetDays: 5, dueLabel: 'Dans les 5 jours', sourceLabel: 's', sourceUrl: 'https://x.test', verifiedOn: '2026-10-30', link: null },
        { id: 'birth-caf', title: 'Caf', category: 'AIDES', dueOffsetDays: null, verifiedOn: 'n’importe quoi' },
        { title: 'sans id' },
      ],
    },
    { label: 'sans type' },
  ];

  it('reads the catalog tolerantly', () => {
    const [definition, ...others] = parseCatalog(raw);
    expect(others).toEqual([]);
    expect(definition.steps).toHaveLength(2);
    expect(definition.steps[0]).toMatchObject({ id: 'birth-declaration', dueOffsetDays: 5, verifiedOn: '2026-10-30' });
    expect(definition.steps[1]).toMatchObject({ dueOffsetDays: null, dueLabel: null, verifiedOn: null, link: null });
    expect(parseCatalog('x')).toEqual([]);
  });

  it('copies the verification date of each step from the catalog, without touching the others', () => {
    const events = attachVerification([lifeEvent()], lifeEventCatalog());
    expect(events[0].steps.every((step) => step.verifiedOn === '2026-10-30')).toBe(true);
    const partial = attachVerification([lifeEvent()], [{ type: 'BIRTH', label: 'x', description: '', steps: [{ ...lifeEventCatalog()[0].steps[0], id: 'birth-declaration' }] }]);
    expect(partial[0].steps.find((step) => step.stepId === 'birth-declaration')?.verifiedOn).toBe('2026-10-30');
    expect(partial[0].steps.find((step) => step.stepId === 'birth-caf-declaration')?.verifiedOn).toBeNull();
  });

  it('keeps the events as they are without a catalog (not loaded or failed)', () => {
    expect(attachVerification([lifeEvent()], undefined)).toEqual([lifeEvent()]);
    expect(attachVerification([lifeEvent()], [])).toEqual([lifeEvent()]);
  });
});

describe('sorting and grouping', () => {
  it('orders by status, then by due date (undated last), then by original order', () => {
    const steps = [
      lifeEventStep({ stepId: 'done', status: 'DONE', doneAt: '2026-10-01T00:00:00Z' }),
      lifeEventStep({ stepId: 'soon-late', status: 'DUE_SOON', dueDate: '2026-11-10' }),
      lifeEventStep({ stepId: 'nodate-1', status: 'NO_DATE', dueDate: null }),
      lifeEventStep({ stepId: 'overdue', status: 'OVERDUE', dueDate: '2026-10-01' }),
      lifeEventStep({ stepId: 'soon-early', status: 'DUE_SOON', dueDate: '2026-11-02' }),
      lifeEventStep({ stepId: 'nodate-2', status: 'NO_DATE', dueDate: null }),
      lifeEventStep({ stepId: 'upcoming', status: 'UPCOMING', dueDate: '2027-01-01' }),
    ];
    expect(sortSteps(steps).map((step) => step.stepId)).toEqual(['overdue', 'soon-early', 'soon-late', 'upcoming', 'nodate-1', 'nodate-2', 'done']);
  });

  it('groups with the labels of the product, empty groups left out', () => {
    expect(groupSteps(lifeEvent().steps).map((group) => [group.status, group.label, group.steps.length])).toEqual([
      ['OVERDUE', 'En retard', 1],
      ['DUE_SOON', 'À faire bientôt (14 jours)', 1],
      ['UPCOMING', 'À venir', 1],
      ['NO_DATE', 'Sans échéance fixe', 1],
      ['DONE', 'Faites', 1],
    ]);
    expect(groupSteps([lifeEventStep({ status: 'DONE', doneAt: '2026-10-01T00:00:00Z' })]).map((group) => group.status)).toEqual(['DONE']);
    expect(groupSteps([])).toEqual([]);
  });

  it('counts by category, in the order of the product', () => {
    expect(countByCategory(lifeEventCatalog()[0].steps)).toEqual([
      { category: 'ADMIN', count: 2 },
      { category: 'AIDES', count: 1 },
      { category: 'SANTE', count: 1 },
      { category: 'BUDGET', count: 1 },
    ]);
  });
});

describe('withCounts and describeProgress', () => {
  it('rounds the percentage down, like the server', () => {
    const steps = Array.from({ length: 18 }, (_, index) => lifeEventStep({ stepId: `s${index}`, status: index < 3 ? 'DONE' : 'UPCOMING' }));
    const event = withCounts({ ...lifeEvent(), steps });
    expect(event).toMatchObject({ doneCount: 3, totalCount: 18, progressPercent: 16 });
  });

  it('writes the progress for a screen reader as well as for the eyes', () => {
    expect(describeProgress({ doneCount: 3, totalCount: 18, progressPercent: 16 })).toBe('3 démarches sur 18 faites — 16 %');
    expect(describeProgress({ doneCount: 1, totalCount: 18, progressPercent: 5 })).toBe('1 démarche sur 18 faite — 5 %');
    expect(describeProgress({ doneCount: 0, totalCount: 18, progressPercent: 0 })).toBe('0 démarche sur 18 faite — 0 %');
    expect(describeProgress({ doneCount: 18, totalCount: 18, progressPercent: 100 })).toBe('18 démarches sur 18 faites — 100 %');
    expect(describeProgress({ doneCount: 0, totalCount: 0, progressPercent: 0 })).toBe('Aucune démarche à suivre pour l’instant');
  });
});

describe('labels', () => {
  it('says whether the birth is expected or has happened', () => {
    expect(describeEventDate({ type: 'BIRTH', eventDate: '2026-11-12' }, NOW)).toBe('Naissance prévue le 12 novembre 2026');
    expect(describeEventDate({ type: 'BIRTH', eventDate: '2026-10-30' }, NOW)).toBe('Naissance le 30 octobre 2026');
    expect(describeEventDate({ type: 'BIRTH', eventDate: '2026-09-03' }, NOW)).toBe('Naissance le 3 septembre 2026');
    expect(describeEventDate({ type: 'MOVE', eventDate: '2026-11-12' }, NOW)).toBe('Prévu le 12 novembre 2026');
  });

  it('writes the due date with its label, or the label alone, or nothing', () => {
    expect(describeDue({ dueDate: '2026-11-05', dueLabel: 'Dans les 5 jours après la naissance' })).toBe('Échéance le 5 nov. 2026 · Dans les 5 jours après la naissance');
    expect(describeDue({ dueDate: '2026-11-05', dueLabel: null })).toBe('Échéance le 5 nov. 2026');
    expect(describeDue({ dueDate: null, dueLabel: 'Dès la naissance' })).toBe('Dès la naissance');
    expect(describeDue({ dueDate: null, dueLabel: null })).toBeNull();
  });

  it('says when a step was done and when its source was verified', () => {
    expect(describeDoneAt({ doneAt: '2026-10-28T09:00:00.000Z' })).toBe('Faite le 28 oct. 2026');
    expect(describeDoneAt({ doneAt: null })).toBeNull();
    expect(describeSourceVerification({ verifiedOn: '2026-10-30' })).toBe('vérifié le 30 octobre 2026');
    expect(describeSourceVerification({ verifiedOn: null })).toBeNull();
  });

  it('summarises what is pressing, and nothing when nothing is', () => {
    expect(describeUrgency(lifeEvent())).toBe('1 en retard · 1 à faire bientôt');
    expect(describeUrgency({ steps: [lifeEventStep({ status: 'UPCOMING' })] })).toBeNull();
    expect(describeUrgency({ steps: [lifeEventStep(), lifeEventStep({ stepId: 'b' })] })).toBe('2 à faire bientôt');
  });

  it('only opens known routes of the application, with the labels used by the advice card', () => {
    expect(stepLinkAction('/aides')).toEqual({ to: '/aides', label: 'Voir les aides' });
    expect(stepLinkAction('/plan')).toEqual({ to: '/plan', label: 'Ouvrir le plan' });
    expect(stepLinkAction('/previsionnel')).toEqual({ to: '/previsionnel', label: 'Voir le prévisionnel' });
    expect(stepLinkAction('/projets')).toEqual({ to: '/projets', label: 'Voir mes projets' });
    expect(stepLinkAction('/comptes')).toEqual({ to: '/comptes', label: 'Voir mes comptes' });
    for (const unknown of ['/dettes', '/inconnue', 'https://example.test', '', null]) {
      expect(stepLinkAction(unknown)).toBeNull();
    }
  });
});

describe('optimistic changes', () => {
  it('ticks a step: it becomes done now, and the counters follow', () => {
    const [event] = applyStepChange([lifeEvent()], 'e1', 'birth-declaration', { done: true }, NOW);
    const step = event.steps.find((candidate) => candidate.stepId === 'birth-declaration');
    expect(step).toMatchObject({ status: 'DONE', doneAt: NOW.toISOString() });
    expect(event).toMatchObject({ doneCount: 2, totalCount: 5, progressPercent: 40 });
    expect(event.steps[event.steps.length - 1].status).toBe('DONE');
  });

  it('unticks a step: the status comes back from the due date, and the note stays', () => {
    const [event] = applyStepChange([lifeEvent()], 'e1', 'birth-family-booklet', { done: false }, NOW);
    expect(event.steps.find((step) => step.stepId === 'birth-family-booklet')).toMatchObject({ status: 'NO_DATE', doneAt: null, note: 'Récupéré à la mairie' });
    expect(event.doneCount).toBe(0);

    const [late] = applyStepChange([lifeEvent({ steps: [lifeEventStep({ status: 'DONE', doneAt: '2026-10-01T00:00:00.000Z', dueDate: '2026-10-05' })] })], 'e1', 'birth-declaration', { done: false }, NOW);
    expect(late.steps[0].status).toBe('OVERDUE');
  });

  it('keeps the original completion date when a done step is ticked again, and changes only the note when asked', () => {
    const [event] = applyStepChange([lifeEvent()], 'e1', 'birth-family-booklet', { note: 'Nouvelle note' }, NOW);
    expect(event.steps.find((step) => step.stepId === 'birth-family-booklet')).toMatchObject({ status: 'DONE', doneAt: '2026-10-28T09:00:00.000Z', note: 'Nouvelle note' });
  });

  it('ignores an unknown event or step, and never mutates its input', () => {
    const original = [lifeEvent()];
    const snapshot = JSON.stringify(original);
    expect(applyStepChange(original, 'autre', 'birth-declaration', { done: true }, NOW)).toEqual(original);
    expect(applyStepChange(original, 'e1', 'inconnue', { done: true }, NOW)).toEqual(original);
    applyStepChange(original, 'e1', 'birth-declaration', { done: true }, NOW);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('puts a step back exactly as it was', () => {
    const original = lifeEvent();
    const step = original.steps.find((candidate) => candidate.stepId === 'birth-declaration')!;
    const ticked = applyStepChange([original], 'e1', 'birth-declaration', { done: true }, NOW);
    expect(restoreStep(ticked, 'e1', step)).toEqual([original]);
  });
});

describe('buildLifeEventPayload', () => {
  it('computes the bounds from today: 24 months back, 18 months ahead', () => {
    expect(eventDateBounds(NOW)).toEqual({ min: '2024-10-30', max: '2028-04-30' });
    expect(eventDateBounds(new Date(2026, 7, 31))).toEqual({ min: '2024-08-31', max: '2028-02-29' });
  });

  it('accepts a date with no label on creation', () => {
    expect(buildLifeEventPayload({ eventDate: '2026-11-12', label: '   ' }, { now: NOW })).toEqual({ ok: true, payload: { eventDate: '2026-11-12' } });
  });

  it('trims the label and keeps it', () => {
    expect(buildLifeEventPayload({ eventDate: '2026-11-12', label: '  Bébé de novembre ' }, { now: NOW })).toEqual({ ok: true, payload: { eventDate: '2026-11-12', label: 'Bébé de novembre' } });
  });

  it('accepts the bounds themselves and refuses a day beyond', () => {
    expect(buildLifeEventPayload({ eventDate: '2024-10-30', label: '' }, { now: NOW }).ok).toBe(true);
    expect(buildLifeEventPayload({ eventDate: '2028-04-30', label: '' }, { now: NOW }).ok).toBe(true);
    const tooOld = buildLifeEventPayload({ eventDate: '2024-10-29', label: '' }, { now: NOW });
    expect(tooOld.ok).toBe(false);
    if (!tooOld.ok) {
      expect(tooOld.errors.eventDate).toContain('entre le 30 octobre 2024 et le 30 avril 2028');
    }
    expect(buildLifeEventPayload({ eventDate: '2028-05-01', label: '' }, { now: NOW }).ok).toBe(false);
  });

  it('requires a real date', () => {
    const missing = buildLifeEventPayload({ eventDate: '', label: '' }, { now: NOW });
    expect(missing).toEqual({ ok: false, errors: { eventDate: 'Indiquez la date de naissance (prévue ou réelle).' } });
    const impossible = buildLifeEventPayload({ eventDate: '2026-02-31', label: '' }, { now: NOW });
    expect(impossible.ok).toBe(false);
    if (!impossible.ok) {
      expect(impossible.errors.eventDate).toContain('pas valide');
    }
  });

  it('limits the label to 60 characters, 60 being fine', () => {
    expect(buildLifeEventPayload({ eventDate: '2026-11-12', label: 'a'.repeat(60) }, { now: NOW }).ok).toBe(true);
    const long = buildLifeEventPayload({ eventDate: '2026-11-12', label: 'a'.repeat(61) }, { now: NOW });
    expect(long).toEqual({ ok: false, errors: { label: 'Le libellé est trop long (60 caractères au plus).' } });
  });

  it('requires a label when editing (the server refuses an empty one) and reports both errors at once', () => {
    const result = buildLifeEventPayload({ eventDate: '', label: ' ' }, { now: NOW, labelRequired: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(['eventDate', 'label']);
    }
    expect(buildLifeEventPayload({ eventDate: '2026-11-12', label: 'Bébé' }, { now: NOW, labelRequired: true })).toEqual({ ok: true, payload: { eventDate: '2026-11-12', label: 'Bébé' } });
  });
});

describe('validateNote', () => {
  it('trims and accepts up to 200 characters', () => {
    expect(validateNote('  RDV lundi  ')).toEqual({ ok: true, note: 'RDV lundi' });
    expect(validateNote('')).toEqual({ ok: true, note: '' });
    expect(validateNote('a'.repeat(200)).ok).toBe(true);
  });

  it('refuses a longer note with a message', () => {
    expect(validateNote('a'.repeat(201))).toEqual({ ok: false, error: 'La note est trop longue (200 caractères au plus).' });
  });
});
