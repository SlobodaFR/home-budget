import { DomainError } from '../shared/domain-error';

export const MAX_STATEMENT_LINES = 2000;
export const MAX_LABEL_LENGTH = 80;

export interface ParsedRow {
  /** Numero de ligne dans le texte source (1 = premiere ligne). */
  line: number;
  date: Date;
  label: string;
  /** Signe : negatif = depense, positif = revenu. */
  amountCents: number;
}

export interface SkippedLine {
  line: number;
  reason: string;
}

export interface ParsedStatement {
  rows: ParsedRow[];
  skipped: SkippedLine[];
  truncated: boolean;
}

interface Columns {
  date: number;
  label: number;
  amount: number;
  debit: number;
  credit: number;
}

const NO_COLUMN = -1;

/**
 * Lit un releve bancaire CSV (separateur `;` ou tabulation). Les colonnes sont
 * reperees par l'en-tete quand il existe, sinon deduites : la premiere date, le
 * dernier montant, le libelle le plus long. Une ligne illisible est signalee, jamais
 * devinee.
 */
export function parseStatement(text: string): ParsedStatement {
  const all = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const truncated = all.length > MAX_STATEMENT_LINES;
  const lines = truncated ? all.slice(0, MAX_STATEMENT_LINES) : all;

  const rows: ParsedRow[] = [];
  const skipped: SkippedLine[] = [];
  let columns: Columns | null = null;

  lines.forEach((raw, index) => {
    const line = index + 1;
    if (!raw.trim()) {
      return;
    }
    const cells = splitCells(raw);
    if (!cells) {
      skipped.push({
        line,
        reason: 'format non reconnu (separateur ; ou tabulation attendu)',
      });
      return;
    }

    const header = detectHeader(cells);
    if (header) {
      columns = header;
      skipped.push({ line, reason: 'en-tete' });
      return;
    }

    const result = readRow(cells, columns);
    if ('reason' in result) {
      skipped.push({ line, reason: result.reason });
      return;
    }
    rows.push({ line, ...result });
  });

  return { rows, skipped, truncated };
}

function splitCells(raw: string): string[] | null {
  const delimiter = raw.includes(';') ? ';' : raw.includes('\t') ? '\t' : null;
  if (!delimiter) {
    return null;
  }
  return raw.split(delimiter).map((cell) =>
    cell
      .trim()
      .replace(/^"(.*)"$/, '$1')
      .trim(),
  );
}

function detectHeader(cells: string[]): Columns | null {
  const hasData = cells.some(
    (cell) => parseDate(cell) !== null || parseAmountCents(cell) !== null,
  );
  if (hasData) {
    return null;
  }
  const normalized = cells.map(normalizeHeader);
  const find = (...names: string[]) =>
    normalized.findIndex((cell) => names.some((name) => cell.startsWith(name)));
  const columns: Columns = {
    date: find('date'),
    label: find('libelle', 'label', 'description', 'intitule', 'operation'),
    amount: find('montant', 'amount'),
    debit: find('debit'),
    credit: find('credit'),
  };
  const known = [
    columns.date,
    columns.label,
    columns.amount,
    columns.debit,
    columns.credit,
  ];
  return known.some((i) => i !== NO_COLUMN) ? columns : null;
}

function normalizeHeader(cell: string): string {
  return cell.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function readRow(
  cells: string[],
  columns: Columns | null,
): { date: Date; label: string; amountCents: number } | { reason: string } {
  const dateIndex =
    columns && columns.date !== NO_COLUMN
      ? columns.date
      : cells.findIndex((cell) => parseDate(cell) !== null);
  const date = dateIndex >= 0 ? parseDate(cells[dateIndex] ?? '') : null;
  if (!date) {
    return { reason: 'date illisible' };
  }

  const amount = readAmount(cells, columns, dateIndex);
  if (amount === null) {
    return { reason: 'montant illisible' };
  }
  if (amount === 0) {
    return { reason: 'montant nul' };
  }

  const label = readLabel(cells, columns, dateIndex);
  if (!label) {
    return { reason: 'libelle absent' };
  }
  return { date, label, amountCents: amount };
}

function readAmount(
  cells: string[],
  columns: Columns | null,
  dateIndex: number,
): number | null {
  if (
    columns &&
    (columns.debit !== NO_COLUMN || columns.credit !== NO_COLUMN)
  ) {
    const debit =
      columns.debit !== NO_COLUMN
        ? parseAmountCents(cells[columns.debit] ?? '')
        : null;
    const credit =
      columns.credit !== NO_COLUMN
        ? parseAmountCents(cells[columns.credit] ?? '')
        : null;
    if (debit !== null && debit !== 0) return -Math.abs(debit);
    if (credit !== null && credit !== 0) return Math.abs(credit);
    return debit ?? credit;
  }
  if (columns && columns.amount !== NO_COLUMN) {
    return parseAmountCents(cells[columns.amount] ?? '');
  }
  for (let i = cells.length - 1; i >= 0; i--) {
    if (i === dateIndex) continue;
    const value = parseAmountCents(cells[i]);
    if (value !== null) return value;
  }
  return null;
}

function readLabel(
  cells: string[],
  columns: Columns | null,
  dateIndex: number,
): string {
  if (columns && columns.label !== NO_COLUMN) {
    return clean(cells[columns.label] ?? '');
  }
  const candidates = cells
    .filter(
      (cell, i) =>
        i !== dateIndex &&
        cell &&
        parseAmountCents(cell) === null &&
        parseDate(cell) === null,
    )
    .sort((a, b) => b.length - a.length);
  return clean(candidates[0] ?? '');
}

function clean(label: string): string {
  return label.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL_LENGTH);
}

/** JJ/MM/AAAA, JJ-MM-AAAA, JJ.MM.AAAA, JJ/MM/AA ou AAAA-MM-JJ, en date UTC valide. */
export function parseDate(cell: string): Date | null {
  const text = cell.trim();
  let day: number;
  let month: number;
  let year: number;

  let match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(text);
  if (match) {
    [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(text);
    if (!match) {
      return null;
    }
    [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (match[3].length === 2) {
      year += 2000;
    }
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return valid ? date : null;
}

/**
 * Montant en centimes entiers, sans passer par un flottant. Accepte « -1 100,00 »,
 * « 1.100,00 », « 1,100.00 », « -1100.00 », « (12,50) », « 12,50- », avec ou sans « € ».
 */
export function parseAmountCents(cell: string): number | null {
  let text = cell
    .replace(/[\u00a0\u202f\s]/g, '')
    .replace(/[€$]|eur$/gi, '')
    .replace(/−/g, '-');
  if (!text) {
    return null;
  }

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.endsWith('-')) {
    negative = true;
    text = text.slice(0, -1);
  }
  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }
  if (!/^[\d.,]+$/.test(text) || !/\d/.test(text)) {
    return null;
  }

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  let integerPart: string;
  let decimalPart = '';
  const decimalSeparator =
    lastComma >= 0 && lastDot >= 0
      ? lastComma > lastDot
        ? ','
        : '.'
      : lastComma >= 0
        ? ','
        : lastDot >= 0 && text.length - lastDot - 1 <= 2
          ? '.'
          : null;

  if (decimalSeparator) {
    const at = text.lastIndexOf(decimalSeparator);
    integerPart = text.slice(0, at).replace(/[.,]/g, '');
    decimalPart = text.slice(at + 1);
  } else {
    integerPart = text.replace(/[.,]/g, '');
  }
  if (
    decimalPart.length > 2 ||
    !/^\d*$/.test(decimalPart) ||
    !/^\d*$/.test(integerPart)
  ) {
    return null;
  }

  const cents =
    Number(integerPart || '0') * 100 +
    Number(decimalPart.padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(cents)) {
    throw new DomainError('Montant trop grand');
  }
  return negative ? -cents : cents;
}
