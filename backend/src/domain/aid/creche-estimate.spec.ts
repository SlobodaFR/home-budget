import { DomainError } from '../shared/domain-error';
import {
  CRECHE_RESOURCES_CEILING_CENTS,
  CRECHE_RESOURCES_FLOOR_CENTS,
  CRECHE_SOURCE_URL,
  effortRateMicro,
  estimateCreche,
} from './creche-estimate';

const estimate = (annualEuros: number, children: number, hours: number) =>
  estimateCreche({
    annualResourcesCents: annualEuros * 100,
    children,
    hoursPerMonth: hours,
    kind: 'COLLECTIVE',
  });

describe('estimateCreche', () => {
  it('uses the 2026 CNAF effort rates (in % per billed hour)', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 12].map(effortRateMicro)).toEqual([
      619, 516, 413, 310, 310, 310, 310, 206, 206, 206,
    ]);
    expect(
      [1, 2, 3, 4, 7, 8].map((n) => estimate(36000, n, 1).effortRatePercent),
    ).toEqual([0.0619, 0.0516, 0.0413, 0.031, 0.031, 0.0206]);
  });

  it('computes a family of 4 children at 6 240 €/month: 6 240 × 0,0310 % = 1,93 €/h', () => {
    // 6 240 € × 12 = 74 880 € par an. 624 000 c × 310 / 1 000 000 = 193,44 c.
    const result = estimate(74880, 4, 160);
    expect(result.monthlyResourcesUsedCents).toBe(624000);
    expect(result.hourlyRateCents).toBe(193);
    // 193 c × 160 h
    expect(result.monthlyBillCents).toBe(30880);
    expect(result.floorApplied).toBe(false);
    expect(result.ceilingApplied).toBe(false);
  });

  it('matches the example of the API contract (5 200 €/month, 4 children, 160 h)', () => {
    const result = estimate(62400, 4, 160);
    expect(result).toEqual({
      kind: 'COLLECTIVE',
      effortRatePercent: 0.031,
      monthlyResourcesUsedCents: 520000,
      hourlyRateCents: 161,
      monthlyBillCents: 25760,
      floorCents: 81462,
      ceilingCents: 850000,
      ceilingApplied: false,
      floorApplied: false,
      verifiedOn: '2026-10-30',
      sourceUrl: CRECHE_SOURCE_URL,
    });
  });

  it.each([
    // children, résultat attendu en centimes pour 3 000 €/mois
    [1, 186], // 300 000 × 0,000619 = 185,7
    [2, 155], // 154,8
    [3, 124], // 123,9
    [4, 93], // 93,0
    [7, 93],
    [8, 62], // 61,8
  ])(
    'applies the rate for %i child(ren) on 3 000 €/month',
    (children, hourly) => {
      expect(estimate(36000, children, 1).hourlyRateCents).toBe(hourly);
    },
  );

  it('bills the rounded hourly rate times the billed hours', () => {
    // 186 c × 100 h
    expect(estimate(36000, 1, 100).monthlyBillCents).toBe(18600);
    expect(estimate(36000, 1, 0).monthlyBillCents).toBe(0);
    // Heures décimales : 161 c × 150,5 h = 24 230,5 c, arrondi au centime supérieur.
    expect(estimate(62400, 4, 150.5).monthlyBillCents).toBe(24231);
    // Pas de dérive flottante sur 0,1 h (161 × 0,1 × 3 = 48,3).
    expect(estimate(62400, 4, 0.3).monthlyBillCents).toBe(48);
  });

  it('lifts low resources to the floor', () => {
    // 6 000 € par an = 500 €/mois < 814,62 €.
    const result = estimate(6000, 1, 100);
    expect(result.floorApplied).toBe(true);
    expect(result.ceilingApplied).toBe(false);
    expect(result.monthlyResourcesUsedCents).toBe(CRECHE_RESOURCES_FLOOR_CENTS);
    // 81 462 × 0,000619 = 50,42
    expect(result.hourlyRateCents).toBe(50);
  });

  it('caps high resources at the ceiling', () => {
    // 120 000 € par an = 10 000 €/mois > 8 500 €.
    const result = estimate(120000, 1, 100);
    expect(result.ceilingApplied).toBe(true);
    expect(result.floorApplied).toBe(false);
    expect(result.monthlyResourcesUsedCents).toBe(
      CRECHE_RESOURCES_CEILING_CENTS,
    );
    // 850 000 × 0,000619 = 526,15
    expect(result.hourlyRateCents).toBe(526);
    expect(result.monthlyBillCents).toBe(52600);
  });

  it('does not flag resources exactly on the floor or the ceiling', () => {
    expect(estimate(8500 * 12, 2, 1).ceilingApplied).toBe(false);
    const onFloor = estimateCreche({
      annualResourcesCents: 81462 * 12,
      children: 2,
      hoursPerMonth: 1,
      kind: 'COLLECTIVE',
    });
    expect(onFloor.floorApplied).toBe(false);
    expect(onFloor.monthlyResourcesUsedCents).toBe(81462);
  });

  it('rounds the monthly resources to the cent', () => {
    const result = estimateCreche({
      annualResourcesCents: 1_000_001,
      children: 1,
      hoursPerMonth: 1,
      kind: 'COLLECTIVE',
    });
    // 1 000 001 / 12 = 83 333,4 -> 83 333
    expect(result.monthlyResourcesUsedCents).toBe(83333);
  });

  it('rejects invalid parameters', () => {
    const base = {
      annualResourcesCents: 3_600_000,
      children: 1,
      hoursPerMonth: 100,
      kind: 'COLLECTIVE' as const,
    };
    for (const bad of [
      { annualResourcesCents: -1 },
      { annualResourcesCents: 1.5 },
      { annualResourcesCents: Number.NaN },
      { children: 0 },
      { children: 1.5 },
      { hoursPerMonth: -1 },
      { hoursPerMonth: 401 },
      { hoursPerMonth: Number.NaN },
      { kind: 'FAMILIALE' as never },
    ]) {
      expect(() => estimateCreche({ ...base, ...bad })).toThrow(DomainError);
    }
    expect(() => estimateCreche({ ...base, hoursPerMonth: 400 })).not.toThrow();
  });
});
