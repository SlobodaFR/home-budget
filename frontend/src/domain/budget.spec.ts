import { describe, expect, it } from 'vitest';
import { describeBlocGap, fillRatio, planTotals } from './budget';

describe('planTotals', () => {
  it('flags euros without a role', () => {
    const totals = planTotals({ incomeCents: 380000, fixeCents: 175000, courantCents: 100000, plaisirCents: 45000, epargneCents: 20000 });
    expect(totals).toEqual({ blocsCents: 340000, balanceCents: 40000, status: 'unassigned' });
  });

  it('detects a balanced plan', () => {
    expect(planTotals({ incomeCents: 100, fixeCents: 50, courantCents: 30, plaisirCents: 10, epargneCents: 10 }).status).toBe('balanced');
  });

  it('detects an overcommitted plan', () => {
    const totals = planTotals({ incomeCents: 100, fixeCents: 90, courantCents: 30, plaisirCents: 0, epargneCents: 0 });
    expect(totals.status).toBe('overcommitted');
    expect(totals.balanceCents).toBe(-20);
  });
});

describe('describeBlocGap', () => {
  it('reports an overrun on a spending bloc', () => {
    expect(describeBlocGap({ bloc: 'COURANT', plannedCents: 100, actualCents: 130, gapCents: 30 })).toEqual({ kind: 'over', amountCents: 30 });
  });

  it('reports what remains on a spending bloc', () => {
    expect(describeBlocGap({ bloc: 'FIXE', plannedCents: 100, actualCents: 60, gapCents: -40 })).toEqual({ kind: 'remaining', amountCents: 40 });
  });

  it('reports a shortfall on savings', () => {
    expect(describeBlocGap({ bloc: 'EPARGNE', plannedCents: 200, actualCents: 50, gapCents: -150 })).toEqual({ kind: 'shortfall', amountCents: 150 });
  });

  it('never treats extra savings as an overrun', () => {
    expect(describeBlocGap({ bloc: 'EPARGNE', plannedCents: 200, actualCents: 300, gapCents: 100 })).toEqual({ kind: 'reached', amountCents: 100 });
  });

  it('ignores empty blocs', () => {
    expect(describeBlocGap({ bloc: 'PLAISIR', plannedCents: 0, actualCents: 0, gapCents: 0 }).kind).toBe('none');
  });
});

describe('fillRatio', () => {
  it('clamps between 0 and 1', () => {
    expect(fillRatio({ plannedCents: 100, actualCents: 150, gapCents: 50 })).toBe(1);
    expect(fillRatio({ plannedCents: 200, actualCents: 50, gapCents: -150 })).toBe(0.25);
  });

  it('fills the bar when spending without a plan', () => {
    expect(fillRatio({ plannedCents: 0, actualCents: 10, gapCents: 10 })).toBe(1);
    expect(fillRatio({ plannedCents: 0, actualCents: 0, gapCents: 0 })).toBe(0);
  });
});
