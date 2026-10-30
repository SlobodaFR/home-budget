import { describe, expect, it } from 'vitest';
import {
  centsToInputValue,
  formatCents,
  formatCentsRounded,
  formatCentsShort,
  formatRatio,
  formatSignedCents,
  MAX_AMOUNT_CENTS,
  parseAmountToCents,
  parseSignedAmountToCents,
  signedCentsToInputValue,
} from './money';

const normalize = (value: string) => value.replace(/[\s  ]/g, ' ');

describe('formatCentsRounded', () => {
  it('rounds to the nearest euro', () => {
    expect(normalize(formatCentsRounded(136666))).toBe('1 367 €');
    expect(normalize(formatCentsRounded(378333))).toBe('3 783 €');
    expect(normalize(formatCentsRounded(49))).toBe('0 €');
    expect(normalize(formatCentsRounded(50))).toBe('1 €');
    expect(normalize(formatCentsRounded(-12060))).toMatch(/^[-−]\s?121 €$/);
  });
});

describe('money formatting', () => {
  it('formats cents as euros with French locale', () => {
    expect(normalize(formatCents(425000))).toBe('4 250,00 €');
  });

  it('formats small and zero amounts', () => {
    expect(normalize(formatCents(5))).toBe('0,05 €');
    expect(normalize(formatCents(0))).toBe('0,00 €');
  });

  it('prefixes credits with a plus sign', () => {
    expect(formatSignedCents(280000)).toMatch(/^\+ /);
  });

  it('prefixes debits with a minus sign', () => {
    expect(formatSignedCents(-8450)).toMatch(/^- /);
  });

  it('formats a ratio as a French percentage', () => {
    expect(normalize(formatRatio(0.0789))).toBe('7,9 %');
  });
});

describe('parseAmountToCents', () => {
  it.each([
    ['12,50', 1250],
    ['12.50', 1250],
    ['12', 1200],
    ['0,5', 50],
    [',75', 75],
    ['12,', 1200],
    ['1 234,56', 123456],
    ['1 234,56 €', 123456],
    ['0', 0],
    [' 8,05 ', 805],
  ])('parses %s as %i cents', (input, expected) => {
    expect(parseAmountToCents(input)).toBe(expected);
  });

  it.each(['', ' ', 'abc', '12,345', '-5', '1,2,3', ',', '12,5e', '1.234,56'])('rejects %j', (input) => {
    expect(parseAmountToCents(input)).toBeNull();
  });

  it('rejects amounts above the maximum', () => {
    expect(parseAmountToCents(String(MAX_AMOUNT_CENTS / 100 + 1))).toBeNull();
    expect(parseAmountToCents(String(MAX_AMOUNT_CENTS / 100))).toBe(MAX_AMOUNT_CENTS);
  });
});

describe('centsToInputValue', () => {
  it('drops the decimals when there are none', () => {
    expect(centsToInputValue(120000)).toBe('1200');
  });

  it('uses a decimal comma', () => {
    expect(centsToInputValue(1250)).toBe('12,50');
    expect(centsToInputValue(805)).toBe('8,05');
  });

  it('round-trips with parseAmountToCents', () => {
    expect(parseAmountToCents(centsToInputValue(14230))).toBe(14230);
  });
});

describe('signed amounts', () => {
  it('reads positive, negative and explicitly positive amounts', () => {
    expect(parseSignedAmountToCents('1 200,50')).toBe(120050);
    expect(parseSignedAmountToCents('-150')).toBe(-15000);
    expect(parseSignedAmountToCents('+30,5')).toBe(3050);
  });

  it('accepts the typographic minus signs and a space after the sign', () => {
    expect(parseSignedAmountToCents('−150')).toBe(-15000);
    expect(parseSignedAmountToCents('– 1 000,01')).toBe(-100001);
  });

  it('never returns a negative zero', () => {
    expect(Object.is(parseSignedAmountToCents('-0'), 0)).toBe(true);
  });

  it('rejects unreadable input', () => {
    for (const input of ['', '-', 'abc', '--5', '12,345', '5-']) {
      expect(parseSignedAmountToCents(input)).toBeNull();
    }
  });

  it('turns cents back into an input value with the sign', () => {
    expect(signedCentsToInputValue(-15050)).toBe('-150,50');
    expect(signedCentsToInputValue(120000)).toBe('1200');
    expect(signedCentsToInputValue(0)).toBe('0');
  });
});

describe('formatCentsShort', () => {
  it('drops the cents of a round amount and keeps them otherwise', () => {
    expect(normalize(formatCentsShort(300000))).toBe('3 000 €');
    expect(normalize(formatCentsShort(40000))).toBe('400 €');
    expect(normalize(formatCentsShort(1250))).toBe('12,50 €');
    expect(normalize(formatCentsShort(0))).toBe('0 €');
    expect(normalize(formatCentsShort(33333))).toBe('333,33 €');
  });
});
