/**
 * Money value object. Stored as integer cents to avoid floating point drift.
 */
export class Money {
  private constructor(private readonly cents: number) {
    if (!Number.isInteger(cents)) {
      throw new Error('Money must be an integer amount of cents');
    }
  }

  static zero(): Money {
    return new Money(0);
  }

  static fromCents(cents: number): Money {
    return new Money(cents);
  }

  static fromEuros(euros: number): Money {
    return new Money(Math.round(euros * 100));
  }

  toCents(): number {
    return this.cents;
  }

  toEuros(): number {
    return this.cents / 100;
  }

  add(other: Money): Money {
    return new Money(this.cents + other.cents);
  }

  subtract(other: Money): Money {
    return new Money(this.cents - other.cents);
  }

  isNegative(): boolean {
    return this.cents < 0;
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }
}
