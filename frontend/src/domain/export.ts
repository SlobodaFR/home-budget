import { isValidDateInput, todayInputValue } from './month';

/** Durée maximale d'un export CSV, bornes incluses (règle du serveur). */
export const MAX_EXPORT_DAYS = 366;

export interface ExportRange {
  from: string;
  to: string;
}

export interface ExportRangeErrors {
  from?: string;
  to?: string;
  range?: string;
}

export type ExportRangeResult = { ok: true; range: ExportRange; days: number } | { ok: false; errors: ExportRangeErrors };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Nombre de jours d'une période, bornes incluses ; `null` si une date est illisible. */
export function daysInRange(from: string, to: string): number | null {
  if (!isValidDateInput(from) || !isValidDateInput(to)) {
    return null;
  }
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

/** Du 1er janvier à aujourd'hui : toujours dans la limite de 366 jours. */
export function defaultExportRange(now: Date = new Date()): ExportRange {
  return { from: `${now.getFullYear()}-01-01`, to: todayInputValue(now) };
}

export const EXPORT_MESSAGES = {
  fromMissing: 'Choisissez la date de début.',
  toMissing: 'Choisissez la date de fin.',
  reversed: 'La date de fin doit être le même jour ou après la date de début.',
  tooLong: `La période est trop longue : ${MAX_EXPORT_DAYS} jours au plus (environ un an). Raccourcissez-la ou faites deux exports.`,
} as const;

export function validateExportRange(from: string, to: string): ExportRangeResult {
  const errors: ExportRangeErrors = {};
  if (!isValidDateInput(from)) {
    errors.from = EXPORT_MESSAGES.fromMissing;
  }
  if (!isValidDateInput(to)) {
    errors.to = EXPORT_MESSAGES.toMissing;
  }
  if (errors.from || errors.to) {
    return { ok: false, errors };
  }
  const days = daysInRange(from, to) as number;
  if (days < 1) {
    return { ok: false, errors: { range: EXPORT_MESSAGES.reversed } };
  }
  if (days > MAX_EXPORT_DAYS) {
    return { ok: false, errors: { range: EXPORT_MESSAGES.tooLong } };
  }
  return { ok: true, range: { from, to }, days };
}

export const backupFilename = (now: Date = new Date()): string => `budget-export-${todayInputValue(now)}.json`;

export const csvFilename = (range: ExportRange): string => `operations-${range.from}_${range.to}.csv`;

/** Retire tout ce qui pourrait sortir du dossier de téléchargement ou casser un nom de fichier. */
export function sanitizeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\u0000-\u001f\u007f"<>:*?|]/g, '').replace(/^.*[\\/]/, '').trim().replace(/^\.+/, '');
  return cleaned.slice(0, 120);
}

/**
 * Nom de fichier proposé par le serveur (`Content-Disposition`), avec la forme étendue `filename*=UTF-8''…` en priorité ;
 * `fallback` si l'en-tête est absent ou inutilisable.
 */
export function filenameFromContentDisposition(header: string | null | undefined, fallback: string): string {
  if (!header) {
    return fallback;
  }
  const extended = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/i.exec(header);
  if (extended) {
    try {
      const decoded = sanitizeFilename(decodeURIComponent(extended[1].trim()));
      if (decoded) {
        return decoded;
      }
    } catch {
      // encodage invalide : on essaie la forme simple
    }
  }
  const quoted = /filename\s*=\s*"([^"]*)"/i.exec(header);
  const plain = quoted ?? /filename\s*=\s*([^;]+)/i.exec(header);
  const name = plain ? sanitizeFilename(plain[1]) : '';
  return name || fallback;
}
