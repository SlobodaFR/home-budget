import { describe, expect, it } from 'vitest';
import { describeMonthsUntil, dueMonthOf, parseProvisions, ProvisionItem, sortProvisions } from './provisions';

const raw = {
  asOf: '2026-10-30',
  items: [
    {
      recurringId: 'r2',
      label: 'Assurance habitation',
      bloc: 'FIXE',
      frequency: 'QUARTERLY',
      amountCents: 30000,
      nextDueDate: '2027-01-05',
      monthsUntilDue: 2,
      monthlyProvisionCents: 10000,
      provisionedSoFarCents: null,
    },
    {
      recurringId: 'r1',
      label: 'Taxe foncière',
      bloc: 'FIXE',
      frequency: 'YEARLY',
      amountCents: 120000,
      nextDueDate: '2026-11-15',
      monthsUntilDue: 0,
      monthlyProvisionCents: 10000,
      provisionedSoFarCents: null,
    },
  ],
  totalMonthlyProvisionCents: 20000,
  totalNextTwelveMonthsCents: 240000,
};

describe('parseProvisions', () => {
  it('reads the contract and sorts by next due date', () => {
    const provisions = parseProvisions(raw);
    expect(provisions.items.map((item) => item.label)).toEqual(['Taxe foncière', 'Assurance habitation']);
    expect(provisions).toMatchObject({ asOf: '2026-10-30', totalMonthlyProvisionCents: 20000, totalNextTwelveMonthsCents: 240000 });
    expect(provisions.items[0]).toMatchObject({ frequency: 'YEARLY', bloc: 'FIXE', provisionedSoFarCents: null });
  });

  it('ignores unreadable lines and survives garbage', () => {
    const provisions = parseProvisions({ items: [null, 3, { label: 'sans id', amountCents: 1 }, { recurringId: 'x', label: 'Ok', amountCents: 500 }] });
    expect(provisions.items).toHaveLength(1);
    expect(provisions.items[0]).toMatchObject({ label: 'Ok', frequency: null, bloc: null, nextDueDate: '', monthsUntilDue: 0, monthlyProvisionCents: 0 });
    expect(parseProvisions(null).items).toEqual([]);
    expect(parseProvisions('nope').totalMonthlyProvisionCents).toBe(0);
  });

  it('recomputes a missing monthly total from the lines', () => {
    const { totalMonthlyProvisionCents: _ignored, ...rest } = raw;
    expect(parseProvisions(rest).totalMonthlyProvisionCents).toBe(20000);
  });

  it('never invents a monthly frequency', () => {
    expect(parseProvisions({ items: [{ ...raw.items[0], frequency: 'MONTHLY' }] }).items[0].frequency).toBeNull();
  });
});

describe('sortProvisions', () => {
  const line = (overrides: Partial<ProvisionItem>): ProvisionItem => ({
    recurringId: 'r',
    label: 'A',
    bloc: null,
    frequency: 'YEARLY',
    amountCents: 100,
    nextDueDate: '2027-01-01',
    monthsUntilDue: 3,
    monthlyProvisionCents: 9,
    provisionedSoFarCents: null,
    ...overrides,
  });

  it('puts the soonest first, unreadable dates last, ties by label', () => {
    const sorted = sortProvisions([
      line({ label: 'Z', nextDueDate: '2027-03-01' }),
      line({ label: 'Sans date', nextDueDate: '' }),
      line({ label: 'B', nextDueDate: '2027-01-01' }),
      line({ label: 'A', nextDueDate: '2027-01-01' }),
    ]);
    expect(sorted.map((item) => item.label)).toEqual(['A', 'B', 'Z', 'Sans date']);
  });
});

describe('helpers', () => {
  it('says how far a due date is', () => {
    expect(describeMonthsUntil(0)).toBe('ce mois-ci');
    expect(describeMonthsUntil(-2)).toBe('ce mois-ci');
    expect(describeMonthsUntil(1)).toBe('dans 1 mois');
    expect(describeMonthsUntil(11)).toBe('dans 11 mois');
  });

  it('reads the due month', () => {
    expect(dueMonthOf({ nextDueDate: '2027-10-15' })).toBe(10);
    expect(dueMonthOf({ nextDueDate: '' })).toBeNull();
  });
});
