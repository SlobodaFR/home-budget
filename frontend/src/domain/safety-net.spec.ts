import { describe, expect, it } from 'vitest';
import { buildSafetyNetPayload, formatMonthsCount, parseSafetyNetState, safetyNetCoverage, safetyNetToForm } from './safety-net';

const NOW = new Date(2026, 10, 12, 9, 0, 0);

describe('safetyNetToForm', () => {
  it('starts with today and a default target when nothing is declared', () => {
    expect(safetyNetToForm(null, NOW)).toEqual({ saved: '', asOf: '2026-11-12', targetMonths: '3' });
  });

  it('fills the form from the saved values', () => {
    expect(safetyNetToForm({ savedCents: 550050, asOf: '2026-11-01', targetMonths: 6 }, NOW)).toEqual({
      saved: '5500,50',
      asOf: '2026-11-01',
      targetMonths: '6',
    });
  });
});

describe('buildSafetyNetPayload', () => {
  const valid = { saved: '5 500', asOf: '2026-11-01', targetMonths: '6' };

  it('converts euros to cents', () => {
    expect(buildSafetyNetPayload(valid)).toEqual({ ok: true, payload: { savedCents: 550000, asOf: '2026-11-01', targetMonths: 6 } });
  });

  it('accepts zero savings', () => {
    expect(buildSafetyNetPayload({ ...valid, saved: '0' }).ok).toBe(true);
  });

  it('rejects an empty or invalid amount', () => {
    expect(buildSafetyNetPayload({ ...valid, saved: '' })).toMatchObject({ ok: false, errors: { saved: expect.any(String) } });
    expect(buildSafetyNetPayload({ ...valid, saved: '12 euros' })).toMatchObject({ ok: false, errors: { saved: expect.any(String) } });
    expect(buildSafetyNetPayload({ ...valid, saved: '-5' })).toMatchObject({ ok: false });
  });

  it('rejects an invalid date', () => {
    expect(buildSafetyNetPayload({ ...valid, asOf: '' })).toMatchObject({ ok: false, errors: { asOf: expect.any(String) } });
    expect(buildSafetyNetPayload({ ...valid, asOf: '2026-13-01' })).toMatchObject({ ok: false });
  });

  it('keeps the target between 1 and 24 whole months', () => {
    for (const targetMonths of ['0', '25', '', 'six', '2.5', '-1']) {
      expect(buildSafetyNetPayload({ ...valid, targetMonths })).toMatchObject({ ok: false, errors: { targetMonths: expect.any(String) } });
    }
    expect(buildSafetyNetPayload({ ...valid, targetMonths: '1' }).ok).toBe(true);
    expect(buildSafetyNetPayload({ ...valid, targetMonths: '24' }).ok).toBe(true);
  });
});

describe('parseSafetyNetState', () => {
  const net = { savedCents: 550000, asOf: '2026-11-01', targetMonths: 6 };

  it('reads the net and the server-computed progress', () => {
    expect(parseSafetyNetState({ safetyNet: net, progress: { currentCents: 600000, monthlyBasisCents: 300000, coveredMonths: 2 } })).toEqual({
      safetyNet: net,
      progress: { currentCents: 600000, monthlyBasisCents: 300000, coveredMonths: 2 },
    });
  });

  it('keeps a null coverage when the basis is unknown', () => {
    expect(parseSafetyNetState({ safetyNet: net, progress: { currentCents: 1, monthlyBasisCents: 0, coveredMonths: null } }).progress).toEqual({
      currentCents: 1,
      monthlyBasisCents: 0,
      coveredMonths: null,
    });
  });

  it('has no progress when nothing is declared', () => {
    expect(parseSafetyNetState({ safetyNet: null, progress: null })).toEqual({ safetyNet: null, progress: null });
    expect(parseSafetyNetState(null)).toEqual({ safetyNet: null, progress: null });
  });

  it('tolerates an older backend without progress, or a malformed one', () => {
    expect(parseSafetyNetState({ safetyNet: net })).toEqual({ safetyNet: net, progress: null });
    expect(parseSafetyNetState({ safetyNet: net, progress: { currentCents: 'x' } }).progress).toBeNull();
  });
});

describe('safetyNetCoverage', () => {
  const net = { savedCents: 550000, asOf: '2026-11-01', targetMonths: 6 };

  it('uses the server figures: current amount, months covered and the part added since the declared date', () => {
    const coverage = safetyNetCoverage(net, { currentCents: 600000, monthlyBasisCents: 300000, coveredMonths: 2 });
    expect(coverage).toEqual({ currentCents: 600000, addedCents: 50000, monthlyBasisCents: 300000, coveredMonths: 2, ratio: 2 / 6, reached: false });
  });

  it('caps the ratio at 1 and flags the goal as reached', () => {
    const coverage = safetyNetCoverage(net, { currentCents: 2000000, monthlyBasisCents: 250000, coveredMonths: 8 });
    expect(coverage).toMatchObject({ ratio: 1, reached: true });
  });

  it('falls back to the declared amount alone without progress', () => {
    expect(safetyNetCoverage(net, null)).toEqual({ currentCents: 550000, addedCents: 0, monthlyBasisCents: null, coveredMonths: null, ratio: 0, reached: false });
  });

  it('shows no months when the server could not compute them', () => {
    expect(safetyNetCoverage(net, { currentCents: 550000, monthlyBasisCents: 0, coveredMonths: null })).toMatchObject({ coveredMonths: null, ratio: 0 });
  });
});

describe('formatMonthsCount', () => {
  it('uses the French decimal comma', () => {
    expect(formatMonthsCount(2.5)).toBe('2,5 mois');
    expect(formatMonthsCount(6)).toBe('6 mois');
  });
});
