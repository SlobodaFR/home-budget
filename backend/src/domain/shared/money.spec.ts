import { Money } from './money';

describe('Money', () => {
  it('converts euros to cents', () => {
    expect(Money.fromEuros(12.5).toCents()).toBe(1250);
  });

  it('adds and subtracts amounts', () => {
    const a = Money.fromCents(1000);
    const b = Money.fromCents(250);
    expect(a.add(b).toCents()).toBe(1250);
    expect(a.subtract(b).toCents()).toBe(750);
  });

  it('detects negative amounts', () => {
    expect(Money.fromCents(-100).isNegative()).toBe(true);
    expect(Money.fromCents(0).isNegative()).toBe(false);
  });

  it('rejects non-integer cents', () => {
    expect(() => Money.fromCents(10.5)).toThrow();
  });

  it('exposes euros representation', () => {
    expect(Money.fromCents(1250).toEuros()).toBe(12.5);
  });
});
