import { describe, expect, it } from 'vitest';
import {
  backupFilename,
  csvFilename,
  daysInRange,
  defaultExportRange,
  EXPORT_MESSAGES,
  filenameFromContentDisposition,
  MAX_EXPORT_DAYS,
  sanitizeFilename,
  validateExportRange,
} from './export';

describe('daysInRange', () => {
  it('counts both bounds', () => {
    expect(daysInRange('2026-10-01', '2026-10-01')).toBe(1);
    expect(daysInRange('2026-10-01', '2026-10-31')).toBe(31);
    expect(daysInRange('2026-01-01', '2026-12-31')).toBe(365);
    expect(daysInRange('2024-01-01', '2024-12-31')).toBe(366);
  });

  it('returns null for an unreadable date', () => {
    expect(daysInRange('', '2026-10-01')).toBeNull();
    expect(daysInRange('2026-02-30', '2026-03-01')).toBeNull();
  });
});

describe('validateExportRange', () => {
  it('accepts a normal period', () => {
    expect(validateExportRange('2026-10-01', '2026-10-31')).toEqual({ ok: true, range: { from: '2026-10-01', to: '2026-10-31' }, days: 31 });
  });

  it('accepts exactly 366 days and refuses 367', () => {
    expect(validateExportRange('2025-11-01', '2026-11-01')).toMatchObject({ ok: true, days: 366 });
    expect(MAX_EXPORT_DAYS).toBe(366);
    expect(validateExportRange('2025-10-31', '2026-11-01')).toEqual({ ok: false, errors: { range: EXPORT_MESSAGES.tooLong } });
  });

  it('accepts a single day and refuses a reversed period', () => {
    expect(validateExportRange('2026-10-05', '2026-10-05')).toMatchObject({ ok: true, days: 1 });
    expect(validateExportRange('2026-10-06', '2026-10-05')).toEqual({ ok: false, errors: { range: EXPORT_MESSAGES.reversed } });
  });

  it('asks for the missing or invalid dates, field by field', () => {
    expect(validateExportRange('', '2026-10-05')).toEqual({ ok: false, errors: { from: EXPORT_MESSAGES.fromMissing } });
    expect(validateExportRange('2026-10-05', '')).toEqual({ ok: false, errors: { to: EXPORT_MESSAGES.toMissing } });
    expect(validateExportRange('', '')).toEqual({ ok: false, errors: { from: EXPORT_MESSAGES.fromMissing, to: EXPORT_MESSAGES.toMissing } });
    expect(validateExportRange('2026-13-01', '2026-10-05')).toMatchObject({ ok: false });
  });

  it('writes the messages in French, reassuringly', () => {
    expect(EXPORT_MESSAGES.tooLong).toContain('366 jours au plus');
    expect(EXPORT_MESSAGES.tooLong).toContain('Raccourcissez');
  });
});

describe('defaults and file names', () => {
  it('proposes 1 January to today, always within the limit', () => {
    expect(defaultExportRange(new Date(2026, 9, 30))).toEqual({ from: '2026-01-01', to: '2026-10-30' });
    for (const date of [new Date(2024, 11, 31), new Date(2026, 11, 31), new Date(2026, 0, 1)]) {
      const range = defaultExportRange(date);
      expect(validateExportRange(range.from, range.to).ok).toBe(true);
    }
  });

  it('builds the fallback names of the contract', () => {
    expect(backupFilename(new Date(2026, 9, 30))).toBe('budget-export-2026-10-30.json');
    expect(csvFilename({ from: '2026-01-01', to: '2026-10-30' })).toBe('operations-2026-01-01_2026-10-30.csv');
  });
});

describe('filenameFromContentDisposition', () => {
  const fallback = 'budget-export-2026-10-30.json';

  it('reads a quoted file name', () => {
    expect(filenameFromContentDisposition('attachment; filename="budget-export-2026-10-29.json"', fallback)).toBe('budget-export-2026-10-29.json');
  });

  it('reads an unquoted file name', () => {
    expect(filenameFromContentDisposition('attachment; filename=operations-2026-01-01_2026-10-30.csv', fallback)).toBe('operations-2026-01-01_2026-10-30.csv');
  });

  it('prefers the extended form and decodes it', () => {
    expect(filenameFromContentDisposition("attachment; filename=\"a.csv\"; filename*=UTF-8''op%C3%A9rations.csv", fallback)).toBe('opérations.csv');
  });

  it('falls back when the header is missing, empty or unusable', () => {
    expect(filenameFromContentDisposition(null, fallback)).toBe(fallback);
    expect(filenameFromContentDisposition(undefined, fallback)).toBe(fallback);
    expect(filenameFromContentDisposition('attachment', fallback)).toBe(fallback);
    expect(filenameFromContentDisposition('attachment; filename=""', fallback)).toBe(fallback);
    expect(filenameFromContentDisposition("attachment; filename*=UTF-8''%E0%A4%A", fallback)).toBe(fallback);
  });

  it('never lets a path or odd characters through', () => {
    expect(filenameFromContentDisposition('attachment; filename="../../etc/passwd"', fallback)).toBe('passwd');
    expect(filenameFromContentDisposition('attachment; filename="C:\\temp\\x.json"', fallback)).toBe('x.json');
    expect(sanitizeFilename('..hidden.json')).toBe('hidden.json');
    expect(sanitizeFilename('a"b<c>d.json')).toBe('abcd.json');
    expect(sanitizeFilename('a\nb.json')).toBe('ab.json');
  });
});
