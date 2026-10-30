import { describe, expect, it } from 'vitest';
import {
  balanceGapCents,
  countByStatus,
  describeBalanceGap,
  Forecast,
  ForecastFigure,
  ForecastOccurrence,
  missingBanner,
  missingOccurrences,
  orderedBlocs,
  projectionNote,
} from './forecast';

const occurrence = (status: ForecastOccurrence['status'], overrides: Partial<ForecastOccurrence> = {}): ForecastOccurrence => ({
  recurringId: 'r1',
  label: 'Loyer',
  kind: 'EXPENSE',
  bloc: 'FIXE',
  amountCents: 110000,
  date: '2026-11-05T00:00:00.000Z',
  estimated: false,
  status,
  ...overrides,
});

const figure = (overrides: Partial<ForecastFigure> = {}): ForecastFigure => ({
  plannedCents: 100000,
  actualCents: 60000,
  expectedRemainingCents: 20000,
  projectedCents: 80000,
  ...overrides,
});

describe('balance explanation', () => {
  it('states how much lower the cautious balance is', () => {
    const forecast = { projectedBalanceCents: 260400, cautiousBalanceCents: 190400 };
    expect(balanceGapCents(forecast)).toBe(70000);
    expect(describeBalanceGap(forecast)).toMatch(/prudent est\s+700,00\s€ plus bas/);
  });

  it('says the balances are identical when nothing more is expected', () => {
    const forecast = { projectedBalanceCents: 1000, cautiousBalanceCents: 1000 };
    expect(balanceGapCents(forecast)).toBe(0);
    expect(describeBalanceGap(forecast)).toMatch(/identiques/);
  });

  it('never reports a negative gap', () => {
    expect(balanceGapCents({ projectedBalanceCents: 100, cautiousBalanceCents: 500 })).toBe(0);
  });
});

describe('occurrences', () => {
  const list = [occurrence('PAID'), occurrence('MISSING', { label: 'Assurance' }), occurrence('DUE'), occurrence('MISSING')];

  it('extracts the missing ones', () => {
    expect(missingOccurrences({ occurrences: list }).map((item) => item.label)).toEqual(['Assurance', 'Loyer']);
  });

  it('counts by status', () => {
    expect(countByStatus(list)).toEqual({ PAID: 1, MISSING: 2, DUE: 1 });
  });

  it('pluralises the banner', () => {
    expect(missingBanner(1)).toBe('1 paiement est attendu mais non retrouvé');
    expect(missingBanner(2)).toBe('2 paiements sont attendus mais non retrouvés');
  });
});

describe('projectionNote', () => {
  it('flags a spending bloc that would exceed its plan', () => {
    expect(projectionNote('COURANT', figure({ projectedCents: 130000 }))).toEqual({ status: 'over', amountCents: 30000 });
  });

  it('is fine when the projection stays under the plan', () => {
    expect(projectionNote('COURANT', figure())).toEqual({ status: 'ok', amountCents: 0 });
  });

  it('flags savings behind their goal, not ahead', () => {
    expect(projectionNote('EPARGNE', figure({ projectedCents: 70000 }))).toEqual({ status: 'behind', amountCents: 30000 });
    expect(projectionNote('EPARGNE', figure({ projectedCents: 150000 }))).toEqual({ status: 'ok', amountCents: 0 });
  });

  it('has nothing to compare without a plan', () => {
    expect(projectionNote('FIXE', figure({ plannedCents: 0, projectedCents: 5000 }))).toEqual({ status: 'ok', amountCents: 0 });
  });
});

describe('orderedBlocs', () => {
  it('returns the 4 blocs in course order and fills in missing ones', () => {
    const blocs: Forecast['blocs'] = [{ bloc: 'PLAISIR', ...figure() }, { bloc: 'FIXE', ...figure() }];
    const result = orderedBlocs(blocs);
    expect(result.map((item) => item.bloc)).toEqual(['FIXE', 'COURANT', 'PLAISIR', 'EPARGNE']);
    expect(result[1].projectedCents).toBe(0);
  });
});
