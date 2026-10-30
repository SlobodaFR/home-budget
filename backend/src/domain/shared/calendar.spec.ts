import { DomainError } from './domain-error';
import {
  daysInMonth,
  isIsoDate,
  parseIsoDate,
  startOfUtcDay,
} from './calendar';
import {
  formatEuros,
  formatMonthLabel,
  formatShortDate,
  formatTenths,
  previousMonth,
} from './format';
import { roundDiv } from './rounding';

describe('calendar', () => {
  it('knows month lengths including leap years', () => {
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(daysInMonth(2028, 1)).toBe(29);
    expect(daysInMonth(2100, 1)).toBe(28);
    expect(daysInMonth(2000, 1)).toBe(29);
    expect(daysInMonth(2026, 3)).toBe(30);
    expect(daysInMonth(2026, 11)).toBe(31);
  });

  it('validates calendar dates', () => {
    expect(isIsoDate('2026-11-30')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
    for (const bad of [
      '2026-02-29',
      '2026-04-31',
      '2026-00-10',
      '2026-13-10',
      '2026-1-10',
      '2026-11-30T00:00:00Z',
      '',
      null,
      20261130,
    ]) {
      expect(isIsoDate(bad)).toBe(false);
    }
    expect(() => parseIsoDate('2026-02-30')).toThrow(DomainError);
    expect(parseIsoDate('2026-02-28').toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    );
  });

  it('truncates an instant to the start of its UTC day', () => {
    expect(startOfUtcDay(new Date('2026-11-12T23:59:59Z')).toISOString()).toBe(
      '2026-11-12T00:00:00.000Z',
    );
  });
});

describe('rounding and formatting', () => {
  it('rounds integer divisions half up', () => {
    expect(roundDiv(5, 2)).toBe(3);
    expect(roundDiv(4, 3)).toBe(1);
    expect(roundDiv(1, 3)).toBe(0);
    expect(roundDiv(1_666_5, 10)).toBe(1667);
    expect(roundDiv(0, 7)).toBe(0);
  });

  it('formats euros, short dates, months and tenths in French', () => {
    const nbsp = ' ';
    expect(formatEuros(0)).toBe(`0${nbsp}€`);
    expect(formatEuros(110000)).toBe(`1${nbsp}100${nbsp}€`);
    expect(formatEuros(123456789)).toBe(`1${nbsp}234${nbsp}567,89${nbsp}€`);
    expect(formatEuros(5)).toBe(`0,05${nbsp}€`);
    expect(formatEuros(-250)).toBe(`-2,50${nbsp}€`);
    expect(formatShortDate(new Date('2026-11-05T00:00:00Z'))).toBe('5 nov.');
    expect(formatShortDate(new Date('2026-02-01T00:00:00Z'))).toBe('1 févr.');
    expect(formatMonthLabel('2026-08')).toBe('août 2026');
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(previousMonth('2026-11')).toBe('2026-10');
    expect(formatTenths(32)).toBe('3,2');
    expect(formatTenths(60)).toBe('6');
    expect(formatTenths(5)).toBe('0,5');
  });
});
