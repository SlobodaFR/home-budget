import { aidCapCents, computeAidRule } from './aid-estimate';
import { AID_RULES, getAidRule, isAidRuleId } from './aid-rules';
import { FiscalProfile } from './fiscal-profile';
import { DomainError } from '../shared/domain-error';

const profile = (
  childrenUnderSix: number,
  dependentChildren: number,
  firstYearHomeServices = false,
) =>
  FiscalProfile.create({
    childrenUnderSix,
    dependentChildren,
    firstYearHomeServices,
  });

describe('aid catalogue', () => {
  it('ships the two rules with their official source', () => {
    expect(AID_RULES.map((r) => r.id)).toEqual([
      'CREDIT_IMPOT_GARDE_HORS_DOMICILE',
      'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE',
    ]);
    for (const rule of AID_RULES) {
      expect(rule.ratePercent).toBe(50);
      expect(rule.verifiedOn).toBe('2026-10-30');
      expect(rule.sourceUrl).toMatch(/^https:\/\/www\.impots\.gouv\.fr\//);
    }
    expect(getAidRule('CREDIT_IMPOT_SERVICES_A_LA_PERSONNE').sourceUrl).toBe(
      'https://www.impots.gouv.fr/particulier/emploi-domicile',
    );
    expect(
      getAidRule('CREDIT_IMPOT_SERVICES_A_LA_PERSONNE').description,
    ).toContain('20 000 €');
    expect(isAidRuleId('CREDIT_IMPOT_GARDE_HORS_DOMICILE')).toBe(true);
    expect(isAidRuleId('AUTRE')).toBe(false);
  });
});

describe('FiscalProfile', () => {
  it('validates counts and the flag', () => {
    expect(() => profile(11, 0)).toThrow(DomainError);
    expect(() => profile(0, -1)).toThrow(DomainError);
    expect(() => profile(1.5, 0)).toThrow(DomainError);
    expect(() => profile(10, 10)).not.toThrow();
  });
});

describe('aidCapCents', () => {
  it('caps childcare at 3 500 € of expenses per child under 6', () => {
    expect(aidCapCents('CREDIT_IMPOT_GARDE_HORS_DOMICILE', profile(0, 0))).toBe(
      0,
    );
    expect(aidCapCents('CREDIT_IMPOT_GARDE_HORS_DOMICILE', profile(1, 1))).toBe(
      350000,
    );
    expect(aidCapCents('CREDIT_IMPOT_GARDE_HORS_DOMICILE', profile(2, 3))).toBe(
      700000,
    );
  });

  it.each([
    // dependentChildren, firstYear, plafond attendu en centimes
    [0, false, 1_200_000],
    [1, false, 1_350_000],
    [2, false, 1_500_000],
    [5, false, 1_500_000], // plafond global de 15 000 €
    [0, true, 1_500_000],
    [1, true, 1_650_000],
    [2, true, 1_800_000],
    [10, true, 1_800_000], // plafond global de 18 000 €
  ])(
    'caps home services for %i dependent child(ren), first year %s',
    (children, firstYear, expected) => {
      expect(
        aidCapCents(
          'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE',
          profile(0, children, firstYear),
        ),
      ).toBe(expected);
    },
  );
});

describe('computeAidRule', () => {
  it('gives half of the spending back below the cap (contract example)', () => {
    const result = computeAidRule(
      'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE',
      [
        {
          recurringId: 'r1',
          label: 'Femme de ménage',
          monthlyCents: 10000,
          yearlySpentCents: 120000,
        },
      ],
      profile(1, 3),
    );
    expect(result).toMatchObject({
      ruleId: 'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE',
      ratePercent: 50,
      spentCents: 120000,
      capCents: 1_500_000,
      eligibleCents: 120000,
      expectedCreditCents: 60000,
      capReached: false,
    });
    expect(result.lines).toEqual([
      {
        recurringId: 'r1',
        label: 'Femme de ménage',
        yearlySpentCents: 120000,
        monthlyCents: 10000,
        netMonthlyCents: 5000,
      },
    ]);
  });

  it('rounds the credit and the net monthly cost to the cent', () => {
    const result = computeAidRule(
      'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE',
      [
        {
          recurringId: 'r1',
          label: 'Ménage',
          monthlyCents: 3333,
          yearlySpentCents: 39997,
        },
      ],
      profile(0, 0),
    );
    // 39 997 × 50 / 100 = 19 998,5 -> 19 999
    expect(result.expectedCreditCents).toBe(19999);
    // 3 333 × 50 / 100 = 1 666,5 -> 1 667
    expect(result.lines[0].netMonthlyCents).toBe(1667);
  });

  it('limits the childcare credit to 1 750 € per child and spreads it pro rata', () => {
    // Crèche 400 €/mois sur 12 mois = 4 800 €, 1 enfant de moins de 6 ans.
    const capped = computeAidRule(
      'CREDIT_IMPOT_GARDE_HORS_DOMICILE',
      [
        {
          recurringId: 'creche',
          label: 'Crèche',
          monthlyCents: 40000,
          yearlySpentCents: 480000,
        },
      ],
      profile(1, 2),
    );
    expect(capped).toMatchObject({
      spentCents: 480000,
      capCents: 350000,
      eligibleCents: 350000,
      expectedCreditCents: 175000,
      capReached: true,
    });
    // 40 000 - round(40 000 × 175 000 / 480 000 = 14 583,33)
    expect(capped.lines[0].netMonthlyCents).toBe(25417);
  });

  it('shares the cap between several lines of the same rule', () => {
    const result = computeAidRule(
      'CREDIT_IMPOT_GARDE_HORS_DOMICILE',
      [
        {
          recurringId: 'a',
          label: 'Crèche',
          monthlyCents: 30000,
          yearlySpentCents: 360000,
        },
        {
          recurringId: 'b',
          label: 'Garderie',
          monthlyCents: 10000,
          yearlySpentCents: 120000,
        },
      ],
      profile(1, 1),
    );
    // 4 800 € de dépenses, plafond 3 500 € -> crédit 1 750 € ; taux effectif 175 000 / 480 000.
    expect(result.spentCents).toBe(480000);
    expect(result.expectedCreditCents).toBe(175000);
    expect(result.lines.map((l) => l.netMonthlyCents)).toEqual([
      30000 - 10938, // 10 937,5 -> 10 938
      10000 - 3646, // 3 645,83 -> 3 646
    ]);
  });

  it('does not flag the cap when the spending equals it', () => {
    const result = computeAidRule(
      'CREDIT_IMPOT_GARDE_HORS_DOMICILE',
      [
        {
          recurringId: 'a',
          label: 'Crèche',
          monthlyCents: 35000,
          yearlySpentCents: 350000,
        },
      ],
      profile(1, 1),
    );
    expect(result.capReached).toBe(false);
    expect(result.expectedCreditCents).toBe(175000);
    expect(result.lines[0].netMonthlyCents).toBe(17500);
  });

  it('gives nothing back when the profile declares no eligible child', () => {
    const result = computeAidRule(
      'CREDIT_IMPOT_GARDE_HORS_DOMICILE',
      [
        {
          recurringId: 'a',
          label: 'Crèche',
          monthlyCents: 40000,
          yearlySpentCents: 480000,
        },
      ],
      FiscalProfile.none(),
    );
    expect(result).toMatchObject({
      capCents: 0,
      eligibleCents: 0,
      expectedCreditCents: 0,
      capReached: true,
    });
    expect(result.lines[0].netMonthlyCents).toBe(40000);
  });
});
