import { describe, expect, it } from 'vitest';
import {
  centsToInputValue,
  formatCents,
  formatRatio,
  formatSignedCents,
  MAX_AMOUNT_CENTS,
  parseAmountToCents,
} from './money';

const normalize = (value: string) => value.replace(/[\s  ]/g, ' ');

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
