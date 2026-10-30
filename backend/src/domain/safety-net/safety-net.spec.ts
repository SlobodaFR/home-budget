import { tx } from '../../testing/builders';
import { SpacePlan } from '../space/space-plan';
import { DomainError } from '../shared/domain-error';
import { SafetyNet } from './safety-net';
import {
  buildSafetyNetProgress,
  coveredMonths,
  essentialSpendCents,
  currentSafetyNetCents,
  referenceMonthlySpendCents,
} from './safety-net-coverage';

const net = (over = {}) =>
  SafetyNet.create({
    savedCents: 550000,
    asOf: '2026-11-01',
    targetMonths: 6,
    ...over,
  });

describe('SafetyNet', () => {
  it('validates its fields', () => {
    expect(() => net({ savedCents: -1 })).toThrow(DomainError);
    expect(() => net({ savedCents: 1.5 })).toThrow(DomainError);
    expect(() => net({ targetMonths: 0 })).toThrow(DomainError);
    expect(() => net({ targetMonths: 25 })).toThrow(DomainError);
    expect(() => net({ targetMonths: 2.5 })).toThrow(DomainError);
    expect(() => net({ asOf: '2026-02-30' })).toThrow(DomainError);
    expect(() => net({ asOf: '1/11/2026' })).toThrow(DomainError);
    expect(() => net({ savedCents: 0, targetMonths: 1 })).not.toThrow();
    expect(() => net({ targetMonths: 24 })).not.toThrow();
  });
});

describe('currentSafetyNetCents', () => {
  it('adds the EPARGNE expenses strictly after the declared date', () => {
    const current = currentSafetyNetCents(net(), [
      tx('EXPENSE', 'EPARGNE', 'Livret', 10000, '2026-10-31T23:00:00Z'),
      tx('EXPENSE', 'EPARGNE', 'Livret', 20000, '2026-11-01T22:00:00Z'),
      tx('EXPENSE', 'EPARGNE', 'Livret', 30000, '2026-11-02T00:00:00Z'),
      tx('EXPENSE', 'EPARGNE', 'Livret', 40000, '2026-12-15'),
      tx('EXPENSE', 'COURANT', 'Courses', 99999, '2026-11-10'),
      tx('INCOME', null, 'Salaire', 99999, '2026-11-10'),
    ]);
    expect(current).toBe(550000 + 30000 + 40000);
  });

  it('is the declared amount when nothing was saved since', () => {
    expect(currentSafetyNetCents(net(), [])).toBe(550000);
  });
});

describe('coverage', () => {
  it('prefers the planned essential spending (FIXE + COURANT)', () => {
    const plan = SpacePlan.create({
      incomeCents: 0,
      fixeCents: 175000,
      courantCents: 100000,
      plaisirCents: 45000,
      epargneCents: 20000,
    });
    expect(referenceMonthlySpendCents(plan, 999999)).toBe(275000);
  });

  it('falls back to the 3-month average of the real essential spending, then to nothing', () => {
    // 900 001 / 3 = 300 000,33 -> 300 000
    expect(referenceMonthlySpendCents(SpacePlan.empty(), 900001)).toBe(300000);
    expect(referenceMonthlySpendCents(SpacePlan.empty(), 0)).toBe(0);
  });

  it('only counts FIXE and COURANT expenses as essential', () => {
    expect(
      essentialSpendCents([
        tx('EXPENSE', 'FIXE', 'Loyer', 100000, '2026-10-05'),
        tx('EXPENSE', 'COURANT', 'Courses', 50000, '2026-10-06'),
        tx('EXPENSE', 'PLAISIR', 'Resto', 9999, '2026-10-07'),
        tx('EXPENSE', 'EPARGNE', 'Livret', 9999, '2026-10-07'),
        tx('INCOME', null, 'Salaire', 9999, '2026-10-07'),
      ]),
    ).toBe(150000);
  });

  it('counts covered months rounded to 0.1', () => {
    expect(coveredMonths(600000, 300000)).toBe(2);
    expect(coveredMonths(700000, 275000)).toBe(2.5); // 2,545
    expect(coveredMonths(710000, 275000)).toBe(2.6); // 2,582
    expect(coveredMonths(0, 275000)).toBe(0);
    expect(coveredMonths(500, 0)).toBeNull();
  });

  it('builds a progress shared by the endpoint and the insight', () => {
    expect(buildSafetyNetProgress(600000, 300000)).toEqual({
      currentCents: 600000,
      monthlyBasisCents: 300000,
      coveredMonths: 2,
    });
    expect(buildSafetyNetProgress(600000, 0).coveredMonths).toBeNull();
  });
});
