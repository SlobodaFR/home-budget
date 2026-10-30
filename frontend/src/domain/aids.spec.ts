import { describe, expect, it } from 'vitest';
import {
  buildCrecheQuery,
  buildFiscalProfile,
  capStatus,
  CrecheEstimate,
  crecheQueryString,
  describeCapStatus,
  describeCrecheLimits,
  describeVerification,
  fiscalProfileToForm,
  formatEffortRate,
  monthlySaving,
  safeExternalUrl,
  sourceHost,
} from './aids';

describe('safeExternalUrl', () => {
  it('keeps http(s) links only', () => {
    expect(safeExternalUrl('https://www.impots.gouv.fr/particulier/questions')).toBe('https://www.impots.gouv.fr/particulier/questions');
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('data:text/html,hi')).toBeNull();
    expect(safeExternalUrl('pas une url')).toBeNull();
  });

  it('shows a readable host', () => {
    expect(sourceHost('https://www.caf.fr/partenaires/x')).toBe('caf.fr');
    expect(sourceHost('nimporte quoi')).toBe('nimporte quoi');
  });

  it('formats the verification date', () => {
    expect(describeVerification('2026-10-30')).toBe('vérifié le 30 octobre 2026');
  });
});

describe('fiscal profile form', () => {
  it('defaults to zero children when nothing is declared', () => {
    expect(fiscalProfileToForm(null)).toEqual({ childrenUnderSix: '0', dependentChildren: '0', firstYearHomeServices: false });
  });

  it('fills from the saved profile', () => {
    expect(fiscalProfileToForm({ childrenUnderSix: 1, dependentChildren: 3, firstYearHomeServices: true })).toEqual({
      childrenUnderSix: '1',
      dependentChildren: '3',
      firstYearHomeServices: true,
    });
  });

  it('builds the payload', () => {
    expect(buildFiscalProfile({ childrenUnderSix: '1', dependentChildren: ' 3 ', firstYearHomeServices: true })).toEqual({
      ok: true,
      payload: { childrenUnderSix: 1, dependentChildren: 3, firstYearHomeServices: true },
    });
  });

  it('accepts the bounds 0 and 10 and rejects the rest', () => {
    expect(buildFiscalProfile({ childrenUnderSix: '0', dependentChildren: '10', firstYearHomeServices: false }).ok).toBe(true);
    for (const bad of ['', '11', '-1', '1.5', 'deux']) {
      expect(buildFiscalProfile({ childrenUnderSix: bad, dependentChildren: '1', firstYearHomeServices: false })).toMatchObject({
        ok: false,
        errors: { childrenUnderSix: expect.any(String) },
      });
    }
  });

  it('reports both fields when both are wrong', () => {
    const result = buildFiscalProfile({ childrenUnderSix: 'a', dependentChildren: 'b', firstYearHomeServices: false });
    expect(result.ok === false && Object.keys(result.errors)).toEqual(['childrenUnderSix', 'dependentChildren']);
  });
});

describe('cap status', () => {
  const rule = { spentCents: 120000, capCents: 1500000, capReached: false };

  it('shows the room left under the cap', () => {
    expect(capStatus(rule)).toEqual({ ratio: 0.08, reached: false, overCapCents: 0, roomCents: 1380000 });
    expect(describeCapStatus(rule)).toMatch(/Il reste\s+13\s?800,00\s€ de dépenses avant le plafond/);
  });

  it('explains what no longer counts once the cap is exceeded', () => {
    const over = { spentCents: 1600000, capCents: 1500000, capReached: true };
    expect(capStatus(over)).toMatchObject({ ratio: 1, reached: true, overCapCents: 100000, roomCents: 0 });
    expect(describeCapStatus(over)).toMatch(/Plafond atteint : 1\s?000,00\s€ de dépenses au-delà/);
  });

  it('trusts the server flag when spending is exactly the cap', () => {
    expect(describeCapStatus({ spentCents: 1500000, capCents: 1500000, capReached: true })).toMatch(/Plafond atteint/);
  });

  it('handles a zero cap', () => {
    expect(capStatus({ spentCents: 5000, capCents: 0, capReached: false }).ratio).toBe(1);
    expect(capStatus({ spentCents: 0, capCents: 0, capReached: false }).ratio).toBe(0);
  });

  it('computes the monthly saving of a line', () => {
    expect(monthlySaving({ monthlyCents: 10000, netMonthlyCents: 5000 })).toBe(5000);
    expect(monthlySaving({ monthlyCents: 10000, netMonthlyCents: 12000 })).toBe(0);
  });
});

describe('creche form', () => {
  const valid = { annualResources: '62 400', children: '2', hoursPerMonth: '140' };

  it('converts euros to cents and builds the query', () => {
    const result = buildCrecheQuery(valid);
    expect(result).toEqual({ ok: true, query: { annualResourcesCents: 6240000, children: 2, hoursPerMonth: 140, kind: 'COLLECTIVE' } });
  });

  it('accepts decimal hours with a comma', () => {
    const result = buildCrecheQuery({ ...valid, hoursPerMonth: '140,5' });
    expect(result.ok && result.query.hoursPerMonth).toBe(140.5);
  });

  it('serialises the query string for the API', () => {
    const result = buildCrecheQuery(valid);
    expect(result.ok && crecheQueryString(result.query)).toBe('annualResourcesCents=6240000&children=2&hoursPerMonth=140&kind=COLLECTIVE');
  });

  it('rejects empty and invalid resources', () => {
    for (const annualResources of ['', 'beaucoup', '-3']) {
      expect(buildCrecheQuery({ ...valid, annualResources })).toMatchObject({ ok: false, errors: { annualResources: expect.any(String) } });
    }
  });

  it('requires at least one child', () => {
    for (const children of ['0', '', 'x', '21']) {
      expect(buildCrecheQuery({ ...valid, children })).toMatchObject({ ok: false, errors: { children: expect.any(String) } });
    }
  });

  it('keeps hours between 0 and 400', () => {
    for (const hoursPerMonth of ['', '401', 'x', '-1']) {
      expect(buildCrecheQuery({ ...valid, hoursPerMonth })).toMatchObject({ ok: false, errors: { hoursPerMonth: expect.any(String) } });
    }
    expect(buildCrecheQuery({ ...valid, hoursPerMonth: '0' }).ok).toBe(true);
    expect(buildCrecheQuery({ ...valid, hoursPerMonth: '400' }).ok).toBe(true);
  });
});

describe('creche result', () => {
  const estimate: Pick<CrecheEstimate, 'floorApplied' | 'ceilingApplied' | 'floorCents' | 'ceilingCents'> = {
    floorApplied: false,
    ceilingApplied: false,
    floorCents: 81462,
    ceilingCents: 850000,
  };

  it('says nothing when no limit applies', () => {
    expect(describeCrecheLimits(estimate)).toBeNull();
  });

  it('explains the floor', () => {
    expect(describeCrecheLimits({ ...estimate, floorApplied: true })).toMatch(/Plancher appliqué.*814,62\s€/);
  });

  it('explains the ceiling', () => {
    expect(describeCrecheLimits({ ...estimate, ceilingApplied: true })).toMatch(/Plafond appliqué.*8\s?500,00\s€/);
  });

  it('formats the effort rate with a decimal comma', () => {
    expect(formatEffortRate(0.031)).toBe('0,031 %');
    expect(formatEffortRate(0.0619)).toBe('0,0619 %');
  });
});
