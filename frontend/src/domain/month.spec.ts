import { describe, expect, it } from 'vitest';
import {
  currentMonth,
  currentYear,
  formatDateInput,
  formatLongDateInput,
  formatDay,
  formatMonthLabel,
  isoToDateInput,
  isMonthOfYear,
  isValidDateInput,
  monthName,
  monthNumberOf,
  monthShortName,
  shiftMonth,
  toApiDate,
  todayInputValue,
} from './month';

describe('month helpers', () => {
  it('reads the current month from the local date', () => {
    expect(currentMonth(new Date(2026, 9, 31, 23, 30))).toBe('2026-10');
  });

  it('shifts across year boundaries', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-10', -13)).toBe('2025-09');
    expect(shiftMonth('2026-10', 0)).toBe('2026-10');
  });

  it('rejects an invalid month', () => {
    expect(() => shiftMonth('2026-13', 1)).toThrow();
  });

  it('labels a month in French', () => {
    expect(formatMonthLabel('2026-10')).toBe('octobre 2026');
    expect(formatMonthLabel('2026-02')).toBe('février 2026');
  });

  it('formats today as a date input value', () => {
    expect(todayInputValue(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('validates real calendar dates only', () => {
    expect(isValidDateInput('2026-02-28')).toBe(true);
    expect(isValidDateInput('2026-02-30')).toBe(false);
    expect(isValidDateInput('')).toBe(false);
    expect(isValidDateInput('03/10/2026')).toBe(false);
  });

  it('sends midnight UTC for another day', () => {
    expect(toApiDate('2026-10-03', new Date(2026, 9, 20, 12))).toBe('2026-10-03T00:00:00.000Z');
  });

  it('keeps the local day when the date is today', () => {
    const now = new Date(2026, 9, 20, 12);
    expect(toApiDate('2026-10-20', now).slice(0, 10)).toBe('2026-10-20');
    expect(toApiDate('2026-10-20', now)).toMatch(/Z$/);
  });

  it('extracts and formats the day of an API date', () => {
    expect(isoToDateInput('2026-10-03T00:00:00.000Z')).toBe('2026-10-03');
    expect(formatDay('2026-10-03T00:00:00.000Z')).toBe('3 oct.');
  });
});

describe('date formatting helpers', () => {
  it('formats a date input in short form', () => {
    expect(formatDateInput('2026-01-05')).toMatch(/^5 janv\.? 2026$/);
    expect(formatDateInput('2026-01-05T10:00:00.000Z')).toMatch(/^5 janv\.? 2026$/);
    expect(formatDateInput('nope')).toBe('nope');
  });

  it('formats a date input in long form', () => {
    expect(formatLongDateInput('2026-10-30')).toBe('30 octobre 2026');
    expect(formatLongDateInput('')).toBe('');
  });

  it('gives the current year', () => {
    expect(currentYear(new Date(2026, 5, 1))).toBe(2026);
  });
});

describe('month names', () => {
  it('names a month in lowercase French', () => {
    expect(monthName(1)).toBe('janvier');
    expect(monthName(2)).toBe('février');
    expect(monthName(12)).toBe('décembre');
    expect(monthShortName(1)).toMatch(/^janv\.?$/);
  });

  it('validates a month of the year', () => {
    expect([1, 12, 6].every(isMonthOfYear)).toBe(true);
    expect([0, 13, 1.5, '3', null, undefined].some(isMonthOfYear)).toBe(false);
  });

  it('reads the month number of a month key', () => {
    expect(monthNumberOf('2026-10')).toBe(10);
    expect(monthNumberOf('2026-13')).toBeNull();
    expect(monthNumberOf('nope')).toBeNull();
  });
});
