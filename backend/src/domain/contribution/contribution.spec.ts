import { computeContributions } from './contribution';

const alice = { userId: 'alice', incomeCents: 350000 };
const bob = { userId: 'bob', incomeCents: 200000 };
const need = 330000;

function byUser(result: ReturnType<typeof computeContributions>) {
  return Object.fromEntries(
    result.shares.map((s) => [s.userId, s.contributionCents]),
  );
}

describe('computeContributions', () => {
  it('splits equally', () => {
    const result = computeContributions('EQUAL', need, [alice, bob]);
    expect(byUser(result)).toEqual({ alice: 165000, bob: 165000 });
    expect(result.shortfallCents).toBe(0);
  });

  it('splits proportionally to incomes', () => {
    const result = computeContributions('PROPORTIONAL', need, [alice, bob]);
    expect(byUser(result)).toEqual({ alice: 210000, bob: 120000 });
  });

  it('leaves the same remainder to everyone', () => {
    const result = computeContributions('EQUAL_REMAINDER', need, [alice, bob]);
    expect(byUser(result)).toEqual({ alice: 240000, bob: 90000 });
    expect(350000 - 240000).toBe(200000 - 90000);
  });

  it('always sums to the need, to the cent', () => {
    for (const mode of ['EQUAL', 'PROPORTIONAL', 'EQUAL_REMAINDER'] as const) {
      const result = computeContributions(mode, 100001, [
        { userId: 'a', incomeCents: 333333 },
        { userId: 'b', incomeCents: 222223 },
        { userId: 'c', incomeCents: 111111 },
      ]);
      const total = result.shares.reduce((s, x) => s + x.contributionCents, 0);
      expect(total).toBe(100001);
    }
  });

  it('caps an equal split at the lower income and redistributes', () => {
    const result = computeContributions('EQUAL', 300000, [
      { userId: 'a', incomeCents: 400000 },
      { userId: 'b', incomeCents: 100000 },
    ]);
    expect(byUser(result)).toEqual({ a: 200000, b: 100000 });
  });

  it('asks nothing from the lower earner when equal remainder needs less', () => {
    const result = computeContributions('EQUAL_REMAINDER', 100000, [
      { userId: 'a', incomeCents: 400000 },
      { userId: 'b', incomeCents: 100000 },
    ]);
    expect(byUser(result)).toEqual({ a: 100000, b: 0 });
  });

  it('reports the shortfall when incomes cannot cover the need', () => {
    const result = computeContributions('PROPORTIONAL', 700000, [alice, bob]);
    expect(byUser(result)).toEqual({ alice: 350000, bob: 200000 });
    expect(result.shortfallCents).toBe(150000);
  });

  it('handles a nil need and an empty household', () => {
    expect(byUser(computeContributions('EQUAL', 0, [alice, bob]))).toEqual({
      alice: 0,
      bob: 0,
    });
    expect(computeContributions('EQUAL', 1000, []).shortfallCents).toBe(1000);
  });

  it('gives nothing to a member without income in a proportional split', () => {
    const result = computeContributions('PROPORTIONAL', 100000, [
      alice,
      { userId: 'kid', incomeCents: 0 },
    ]);
    expect(byUser(result)).toEqual({ alice: 100000, kid: 0 });
  });
});
