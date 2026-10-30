import { DomainError } from '../shared/domain-error';
import {
  LifeEvent,
  LifeEventProps,
  assertEventDateInRange,
  shiftIsoDateByMonths,
} from './life-event';

const base: LifeEventProps = {
  id: 'e1',
  householdId: 'h1',
  type: 'BIRTH',
  label: "Naissance d'un enfant",
  eventDate: '2026-11-20',
  createdAt: new Date('2026-10-30T10:00:00Z'),
  progress: [],
};

describe('shiftIsoDateByMonths', () => {
  it('shifts by calendar months and brings the day back to the end of a shorter month', () => {
    expect(shiftIsoDateByMonths('2026-10-30', -24)).toBe('2024-10-30');
    expect(shiftIsoDateByMonths('2026-10-30', 18)).toBe('2028-04-30');
    expect(shiftIsoDateByMonths('2026-08-31', 6)).toBe('2027-02-28');
    expect(shiftIsoDateByMonths('2028-02-29', 12)).toBe('2029-02-28');
    expect(shiftIsoDateByMonths('2026-01-15', -2)).toBe('2025-11-15');
  });
});

describe('assertEventDateInRange', () => {
  const today = new Date('2026-10-30T23:30:00Z');

  it('accepts dates from 24 months in the past to 18 months ahead, bounds included', () => {
    for (const date of ['2024-10-30', '2026-10-30', '2028-04-30']) {
      expect(() => assertEventDateInRange(date, today)).not.toThrow();
    }
  });

  it('refuses a day before or after the bounds, with a French message', () => {
    for (const date of ['2024-10-29', '2028-05-01']) {
      expect(() => assertEventDateInRange(date, today)).toThrow(DomainError);
      expect(() => assertEventDateInRange(date, today)).toThrow(/24 mois/);
    }
  });

  it('refuses an invalid date', () => {
    for (const date of ['2026-02-30', '2026-13-01', 'demain', '2026-1-1']) {
      expect(() => assertEventDateInRange(date, today)).toThrow(/AAAA-MM-JJ/);
    }
  });
});

describe('LifeEvent', () => {
  it('trims the label and refuses an empty or too long one (60 max)', () => {
    expect(LifeEvent.create({ ...base, label: '  Bébé  ' }).label).toBe('Bébé');
    expect(
      LifeEvent.create({ ...base, label: 'x'.repeat(60) }).label,
    ).toHaveLength(60);
    expect(() => LifeEvent.create({ ...base, label: '   ' })).toThrow(
      DomainError,
    );
    expect(() => LifeEvent.create({ ...base, label: 'x'.repeat(61) })).toThrow(
      /trop long/,
    );
  });

  it('refuses an unknown type and an invalid date', () => {
    expect(() =>
      LifeEvent.create({ ...base, type: 'MOVING' as never }),
    ).toThrow(DomainError);
    expect(() =>
      LifeEvent.create({ ...base, eventDate: '2026-02-30' }),
    ).toThrow(DomainError);
  });

  it('marks a step done once, keeping the first doneAt when it is marked again', () => {
    const first = new Date('2026-11-21T08:00:00Z');
    const later = new Date('2026-11-25T08:00:00Z');
    const done = LifeEvent.create(base).withStep('s1', true, first);
    const again = done.withStep('s1', true, later, 'fait en ligne');
    expect(again.progressOf('s1')).toEqual({
      stepId: 's1',
      doneAt: first,
      note: 'fait en ligne',
    });
  });

  it('clears doneAt when unchecked but keeps the note; drops the row when nothing is left', () => {
    const now = new Date('2026-11-21T08:00:00Z');
    const noted = LifeEvent.create(base)
      .withStep('s1', true, now, 'à relire')
      .withStep('s1', false, now);
    expect(noted.progressOf('s1')).toEqual({
      stepId: 's1',
      doneAt: null,
      note: 'à relire',
    });
    expect(noted.withStep('s1', false, now, '').progress).toEqual([]);
  });

  it('keeps the existing note when none is given, and refuses a note over 200 characters', () => {
    const now = new Date('2026-11-21T08:00:00Z');
    const event = LifeEvent.create(base).withStep('s1', false, now, 'rappel');
    expect(event.withStep('s1', true, now).progressOf('s1')?.note).toBe(
      'rappel',
    );
    expect(() => event.withStep('s1', true, now, 'x'.repeat(201))).toThrow(
      /trop longue/,
    );
    expect(() =>
      event.withStep('s1', true, now, 'x'.repeat(200)),
    ).not.toThrow();
  });

  it('keeps the progress when the date or the label change', () => {
    const now = new Date('2026-11-21T08:00:00Z');
    const moved = LifeEvent.create(base)
      .withStep('s1', true, now)
      .withDetails('Bébé', '2026-12-01');
    expect(moved.eventDate).toBe('2026-12-01');
    expect(moved.label).toBe('Bébé');
    expect(moved.progressOf('s1')?.doneAt).toEqual(now);
  });
});
