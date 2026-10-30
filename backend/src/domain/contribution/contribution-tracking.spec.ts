import { DomainError } from '../shared/domain-error';
import {
  OVERPAID_TOLERANCE_CENTS,
  assertContributionMonth,
  contributionLabel,
  contributionStatus,
} from './contribution-tracking';

describe('contributionStatus', () => {
  it('is UNKNOWN, with no remaining amount, when the rule cannot be computed', () => {
    expect(contributionStatus(null, 0)).toEqual({
      remainingCents: null,
      status: 'UNKNOWN',
    });
    expect(contributionStatus(null, 50000)).toEqual({
      remainingCents: null,
      status: 'UNKNOWN',
    });
  });

  it('is PENDING when nothing was paid', () => {
    expect(contributionStatus(175000, 0)).toEqual({
      remainingCents: 175000,
      status: 'PENDING',
    });
  });

  it('is PARTIAL while less than the expected amount was paid', () => {
    expect(contributionStatus(175000, 120000)).toEqual({
      remainingCents: 55000,
      status: 'PARTIAL',
    });
    expect(contributionStatus(175000, 174999)).toEqual({
      remainingCents: 1,
      status: 'PARTIAL',
    });
  });

  it('is PAID as soon as the expected amount is reached, up to the 1 € tolerance', () => {
    expect(contributionStatus(175000, 175000)).toEqual({
      remainingCents: 0,
      status: 'PAID',
    });
    expect(
      contributionStatus(175000, 175000 + OVERPAID_TOLERANCE_CENTS),
    ).toEqual({ remainingCents: 0, status: 'PAID' });
  });

  it('is OVERPAID only strictly above expected + 100 cents', () => {
    expect(
      contributionStatus(175000, 175000 + OVERPAID_TOLERANCE_CENTS + 1),
    ).toEqual({ remainingCents: 0, status: 'OVERPAID' });
    expect(OVERPAID_TOLERANCE_CENTS).toBe(100);
  });

  it('is NONE when nothing is expected, never negative', () => {
    expect(contributionStatus(0, 0)).toEqual({
      remainingCents: 0,
      status: 'NONE',
    });
    expect(contributionStatus(0, 20000)).toEqual({
      remainingCents: 0,
      status: 'NONE',
    });
  });
});

describe('assertContributionMonth', () => {
  const now = new Date('2026-11-12T09:00:00Z');

  it('accepts past months, the current month and the next one', () => {
    for (const month of ['2020-01', '2026-10', '2026-11', '2026-12']) {
      expect(() => assertContributionMonth(month, now)).not.toThrow();
    }
  });

  it('refuses a month more than one month ahead, also across a year boundary', () => {
    expect(() => assertContributionMonth('2027-01', now)).toThrow(DomainError);
    expect(() => assertContributionMonth('2027-01', now)).toThrow(
      /mois prochain/,
    );
    expect(() =>
      assertContributionMonth('2027-01', new Date('2026-12-31T23:00:00Z')),
    ).not.toThrow();
    expect(() =>
      assertContributionMonth('2027-02', new Date('2026-12-31T23:00:00Z')),
    ).toThrow(DomainError);
  });

  it('refuses a malformed month', () => {
    for (const month of ['2026-13', '2026-1', 'novembre', '']) {
      expect(() => assertContributionMonth(month, now)).toThrow(DomainError);
    }
  });
});

describe('contributionLabel', () => {
  it('uses the first name of the member', () => {
    expect(contributionLabel('Alice')).toBe('Contribution de Alice');
    expect(contributionLabel('  Thomas   Sloboda ')).toBe(
      'Contribution de Thomas',
    );
  });

  it('falls back to a generic name and never exceeds the label limit', () => {
    expect(contributionLabel('')).toBe('Contribution de Membre');
    expect(contributionLabel('x'.repeat(200)).length).toBeLessThanOrEqual(80);
  });
});
