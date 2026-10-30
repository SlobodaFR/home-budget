import { rec } from '../../testing/builders';
import {
  addMonthsClamped,
  buildProvisions,
  nextOccurrenceDate,
  wholeMonthsBetween,
} from './provisions';

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (date: Date | null) => date?.toISOString().slice(0, 10);

const taxe = (over = {}) =>
  rec('EXPENSE', 'FIXE', 'Taxe foncière', 120000, {
    frequency: 'YEARLY',
    monthOfYear: 10,
    dayOfMonth: 15,
    ...over,
  });
const assurance = (over = {}) =>
  rec('EXPENSE', 'FIXE', 'Assurance auto', 30000, {
    frequency: 'QUARTERLY',
    monthOfYear: 11,
    dayOfMonth: 5,
    ...over,
  });

describe('date helpers', () => {
  it('adds months clamping the day to the target month', () => {
    expect(iso(addMonthsClamped(d('2026-01-30'), 1))).toBe('2026-02-28');
    expect(iso(addMonthsClamped(d('2028-01-30'), 1))).toBe('2028-02-29');
    expect(iso(addMonthsClamped(d('2028-02-29'), 12))).toBe('2029-02-28');
    expect(iso(addMonthsClamped(d('2026-10-30'), 12))).toBe('2027-10-30');
    expect(iso(addMonthsClamped(d('2026-11-15'), 3))).toBe('2027-02-15');
  });

  it('counts whole months between two dates', () => {
    expect(wholeMonthsBetween(d('2026-10-30'), d('2027-10-15'))).toBe(11);
    expect(wholeMonthsBetween(d('2026-10-30'), d('2027-10-30'))).toBe(12);
    expect(wholeMonthsBetween(d('2026-10-30'), d('2026-11-05'))).toBe(0);
    expect(wholeMonthsBetween(d('2026-10-30'), d('2026-10-30'))).toBe(0);
    expect(wholeMonthsBetween(d('2026-10-30'), d('2026-11-30'))).toBe(1);
    // 31 janvier -> 28 février : dernier jour du mois, donc un mois entier.
    expect(wholeMonthsBetween(d('2027-01-31'), d('2027-02-28'))).toBe(1);
    expect(wholeMonthsBetween(d('2027-01-31'), d('2027-03-30'))).toBe(1);
    expect(wholeMonthsBetween(d('2026-12-20'), d('2027-01-19'))).toBe(0);
    expect(wholeMonthsBetween(d('2026-12-20'), d('2027-03-20'))).toBe(3);
  });
});

describe('nextOccurrenceDate', () => {
  it('includes the reference day and looks across the year boundary', () => {
    expect(iso(nextOccurrenceDate(taxe(), d('2026-10-15')))).toBe('2026-10-15');
    expect(iso(nextOccurrenceDate(taxe(), d('2026-10-16')))).toBe('2027-10-15');
    expect(iso(nextOccurrenceDate(assurance(), d('2026-12-01')))).toBe(
      '2027-02-05',
    );
  });

  it('respects startDate and endDate', () => {
    // Avant startDate : la série ne démarre qu'en 2028.
    expect(
      iso(
        nextOccurrenceDate(taxe({ startDate: '2028-01-01' }), d('2026-10-30')),
      ),
    ).toBe('2028-10-15');
    // Date de la première année avant startDate : on saute à l'année suivante.
    expect(
      iso(
        nextOccurrenceDate(taxe({ startDate: '2026-11-01' }), d('2026-01-01')),
      ),
    ).toBe('2027-10-15');
    expect(
      nextOccurrenceDate(taxe({ endDate: '2026-12-31' }), d('2026-10-30')),
    ).toBeNull();
    expect(
      nextOccurrenceDate(taxe({ active: false }), d('2026-10-30')),
    ).toBeNull();
  });
});

describe('buildProvisions', () => {
  it('reproduces the contract example (yearly property tax on 30 October 2026)', () => {
    const result = buildProvisions([taxe()], new Date('2026-10-30T15:00:00Z'));
    expect(iso(result.asOf)).toBe('2026-10-30');
    expect(result.items).toEqual([
      {
        recurringId: expect.any(String),
        label: 'Taxe foncière',
        bloc: 'FIXE',
        frequency: 'YEARLY',
        amountCents: 120000,
        nextDueDate: d('2027-10-15'),
        monthsUntilDue: 11,
        monthlyProvisionCents: 10000,
      },
    ]);
    expect(result.totalMonthlyProvisionCents).toBe(10000);
    expect(result.totalNextTwelveMonthsCents).toBe(120000);
  });

  it('counts the four occurrences of a quarterly payment in the next twelve months', () => {
    // asOf 30 oct. 2026 : 5 nov., 5 févr., 5 mai, 5 août ; le 5 nov. 2027 est hors fenêtre.
    const result = buildProvisions([assurance()], d('2026-10-30'));
    expect(iso(result.items[0].nextDueDate)).toBe('2026-11-05');
    expect(result.items[0].monthsUntilDue).toBe(0);
    expect(result.items[0].monthlyProvisionCents).toBe(10000);
    expect(result.totalNextTwelveMonthsCents).toBe(4 * 30000);
  });

  it('keeps the window end exclusive: the same day next year is out', () => {
    const result = buildProvisions(
      [taxe({ monthOfYear: 10, dayOfMonth: 30 })],
      d('2026-10-30'),
    );
    expect(iso(result.items[0].nextDueDate)).toBe('2026-10-30');
    expect(result.items[0].monthsUntilDue).toBe(0);
    expect(result.totalNextTwelveMonthsCents).toBe(120000);
  });

  it('sorts by next due date, sums provisions rounded up and ignores what is not provisionable', () => {
    const items = [
      taxe(),
      assurance(),
      rec('EXPENSE', 'FIXE', 'Loyer', 110000), // mensuel
      rec('INCOME', null, 'Prime', 200000, {
        frequency: 'YEARLY',
        monthOfYear: 12,
      }), // revenu
      assurance({ active: false }),
      taxe({ endDate: '2026-12-31' }), // série terminée
      rec('EXPENSE', 'PLAISIR', 'Vacances', 100, {
        frequency: 'YEARLY',
        monthOfYear: 7,
        dayOfMonth: 1,
      }),
    ];
    const result = buildProvisions(items, d('2026-10-30'));
    expect(result.items.map((i) => [i.label, iso(i.nextDueDate)])).toEqual([
      ['Assurance auto', '2026-11-05'],
      ['Vacances', '2027-07-01'],
      ['Taxe foncière', '2027-10-15'],
    ]);
    // 10 000 + ceil(100 / 12) = 9 + 10 000
    expect(result.totalMonthlyProvisionCents).toBe(20009);
    // 4 × 30 000 + 100 + 120 000
    expect(result.totalNextTwelveMonthsCents).toBe(240100);
  });

  it('handles a series starting far in the future and an empty list', () => {
    const result = buildProvisions(
      [taxe({ startDate: '2028-01-01' })],
      d('2026-10-30'),
    );
    expect(iso(result.items[0].nextDueDate)).toBe('2028-10-15');
    expect(result.items[0].monthsUntilDue).toBe(23);
    expect(result.totalNextTwelveMonthsCents).toBe(0);
    expect(buildProvisions([], d('2026-10-30'))).toEqual({
      asOf: d('2026-10-30'),
      items: [],
      totalMonthlyProvisionCents: 0,
      totalNextTwelveMonthsCents: 0,
    });
  });

  it('handles a leap-day reference', () => {
    const result = buildProvisions(
      [taxe({ monthOfYear: 2, dayOfMonth: 29 })],
      d('2028-02-29'),
    );
    expect(iso(result.items[0].nextDueDate)).toBe('2028-02-29');
    // Fenêtre [29 févr. 2028, 28 févr. 2029[ : le 28 févr. 2029 est exclu.
    expect(result.totalNextTwelveMonthsCents).toBe(120000);
  });
});
