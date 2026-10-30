import { isIsoDate } from '../shared/calendar';
import {
  LIFE_EVENT_CATALOG,
  LIFE_EVENT_TYPES,
  STEP_CATEGORIES,
  STEP_LINKS,
  findDefinition,
} from './catalog';

/**
 * Garde-fous du catalogue : ils ne prouvent PAS que le contenu est juste (c'est le rôle de la
 * relecture des sources, cf. `catalog.ts`) mais empêchent les erreurs de forme et l'ajout
 * d'une source non officielle.
 */
const OFFICIAL_HOSTS = [
  'www.service-public.gouv.fr',
  'www.caf.fr',
  'monenfant.fr',
  'www.impots.gouv.fr',
  'www.ameli.fr',
  'www.travail-emploi.gouv.fr',
  'www.mesquestionsdargent.fr',
];

/** Routes de l'application connues du frontend. */
const KNOWN_ROUTES = [
  '/',
  '/plan',
  '/import',
  '/foyer',
  '/previsionnel',
  '/aides',
  '/comptes',
  '/projets',
  '/revue',
  '/dettes',
  '/tendances',
  '/evenements',
];

const allSteps = LIFE_EVENT_CATALOG.flatMap((d) =>
  d.steps.map((step) => ({ type: d.type, step })),
);

describe('life event catalog', () => {
  it('declares one definition per known type, with a label and a description', () => {
    expect(LIFE_EVENT_CATALOG.map((d) => d.type).sort()).toEqual(
      [...LIFE_EVENT_TYPES].sort(),
    );
    for (const definition of LIFE_EVENT_CATALOG) {
      expect(definition.label.trim()).not.toBe('');
      expect(definition.description.trim()).not.toBe('');
      expect(definition.steps.length).toBeGreaterThan(0);
      expect(findDefinition(definition.type)).toBe(definition);
    }
    expect(findDefinition('MOVING')).toBeUndefined();
  });

  it('has unique step ids across the whole catalog', () => {
    const ids = allSteps.map(({ step }) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('cites an https source on an official host for every step', () => {
    for (const { step } of allSteps) {
      const url = new URL(step.sourceUrl);
      expect([step.id, url.protocol]).toEqual([step.id, 'https:']);
      expect([step.id, OFFICIAL_HOSTS.includes(url.host)]).toEqual([
        step.id,
        true,
      ]);
      expect(step.sourceLabel.trim()).not.toBe('');
    }
  });

  it('dates every verification with a real YYYY-MM-DD date', () => {
    for (const { step } of allSteps) {
      expect([step.id, isIsoDate(step.verifiedOn)]).toEqual([step.id, true]);
    }
  });

  it('only links to known application routes', () => {
    for (const { step } of allSteps) {
      if (step.link !== null) {
        expect([step.id, STEP_LINKS as readonly string[]]).toEqual([
          step.id,
          expect.arrayContaining([step.link]),
        ]);
        expect(KNOWN_ROUTES).toContain(step.link);
      }
    }
  });

  it('uses integer offsets (or null), a label whenever there is a deadline, and a known category', () => {
    for (const { step } of allSteps) {
      if (step.dueOffsetDays !== null) {
        expect([step.id, Number.isInteger(step.dueOffsetDays)]).toEqual([
          step.id,
          true,
        ]);
        expect([step.id, step.dueLabel !== null]).toEqual([step.id, true]);
      }
      expect(STEP_CATEGORIES as readonly string[]).toContain(step.category);
      expect(step.title.trim()).not.toBe('');
      expect(step.detail.trim()).not.toBe('');
    }
  });

  it('promises no amount in euros (they change yearly and depend on resources)', () => {
    for (const { step } of allSteps) {
      expect([step.id, /\d\s?(€|euros?)/i.test(step.detail)]).toEqual([
        step.id,
        false,
      ]);
    }
  });

  it('keeps the two deadlines that follow from the birth date', () => {
    const byId = new Map(allSteps.map(({ step }) => [step.id, step]));
    expect(byId.get('birth-declaration')?.dueOffsetDays).toBe(5);
    expect(byId.get('birth-tax-declaration')?.dueOffsetDays).toBe(60);
  });
});
