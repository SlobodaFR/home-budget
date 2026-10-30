/**
 * Export CSV compatible tableur français : UTF-8 avec BOM, séparateur `;`,
 * décimale `,`, fins de ligne CRLF, et protection contre l'injection de formules.
 */
export const CSV_BOM = '﻿';
export const CSV_SEPARATOR = ';';
const CSV_NEWLINE = '\r\n';

/** Un tableur interprète comme formule une cellule qui commence par l'un de ces caractères. */
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Neutralise une cellule texte : préfixe d'une apostrophe si elle commence (au
 * premier caractère, ou après des espaces) par `=`, `+`, `-`, `@`, une tabulation
 * ou un retour chariot ; puis l'entoure de guillemets (doublés à l'intérieur) si
 * elle contient `;`, `"`, un saut de ligne, une tabulation ou des espaces en bordure.
 */
export function csvText(value: string): string {
  const first = value.charAt(0);
  const firstVisible = value.trimStart().charAt(0);
  const dangerous =
    FORMULA_TRIGGERS.includes(first) ||
    (first === ' ' && FORMULA_TRIGGERS.includes(firstVisible));
  const safe = dangerous ? `'${value}` : value;
  const needsQuotes = /[;"\r\n\t]/.test(safe) || safe !== safe.trim();
  return needsQuotes ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Montant en centimes -> « 142,30 » (entiers, sans séparateur de milliers). */
export function csvAmount(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

export function csvLine(cells: string[]): string {
  return cells.join(CSV_SEPARATOR);
}

export interface TransactionCsvRow {
  /** AAAA-MM-JJ. */
  date: string;
  kind: 'INCOME' | 'EXPENSE';
  bloc: string | null;
  label: string;
  amountCents: number;
  accountName: string;
}

export const TRANSACTIONS_CSV_HEADER = [
  'Date',
  'Type',
  'Bloc',
  'Libellé',
  'Montant',
  'Compte',
];

const KIND_LABEL = { INCOME: 'Revenu', EXPENSE: 'Dépense' } as const;
const BLOC_LABEL: Record<string, string> = {
  FIXE: 'Fixe',
  COURANT: 'Courant',
  PLAISIR: 'Plaisir',
  EPARGNE: 'Épargne',
};

/** CSV des opérations : en-tête puis une ligne par opération, montants positifs (le type donne le sens). */
export function buildTransactionsCsv(rows: TransactionCsvRow[]): string {
  const lines = [
    csvLine(TRANSACTIONS_CSV_HEADER),
    ...rows.map((row) =>
      csvLine([
        row.date,
        KIND_LABEL[row.kind],
        row.bloc ? csvText(BLOC_LABEL[row.bloc] ?? row.bloc) : '',
        csvText(row.label),
        csvAmount(row.amountCents),
        csvText(row.accountName),
      ]),
    ),
  ];
  return CSV_BOM + lines.join(CSV_NEWLINE) + CSV_NEWLINE;
}
