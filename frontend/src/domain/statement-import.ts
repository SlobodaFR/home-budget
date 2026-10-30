import { Bloc, BLOCS } from './bloc';
import { TransactionKind } from './budget';
import { deriveKeyword, LearnedRule } from './rule-keyword';
import { defaultLabel } from './transaction-form';

export type ImportTarget = Bloc | 'INCOME' | 'IGNORE';

export const IMPORT_TARGETS: readonly ImportTarget[] = [...BLOCS, 'INCOME', 'IGNORE'];

export const TARGET_LABEL: Record<ImportTarget, string> = {
  FIXE: 'Fixe',
  COURANT: 'Courant',
  PLAISIR: 'Plaisir',
  EPARGNE: 'Épargne',
  INCOME: 'Revenu',
  IGNORE: 'Ignorer',
};

export const MAX_COMMIT_ITEMS = 500;
export const MAX_COMMIT_LABEL_LENGTH = 80;

export interface Suggestion {
  target: ImportTarget | null;
  rule: string | null;
}

export interface PreviewRow {
  index: number;
  date: string;
  label: string;
  amountCents: number;
  suggestion: Suggestion;
  duplicate: boolean;
}

export interface SkippedLine {
  line: number;
  reason: string;
}

export interface ImportPreview {
  rows: PreviewRow[];
  skipped: SkippedLine[];
  truncated: boolean;
}

export interface CommitItem {
  kind: TransactionKind;
  bloc?: Bloc;
  label: string;
  amountCents: number;
  date: string;
}

export interface Rule {
  keyword: string;
  target: ImportTarget;
}

export interface RuleSet {
  rules: Rule[];
  isDefault: boolean;
}

export type Choices = Record<number, ImportTarget | null>;

export interface RowGroups {
  toClassify: PreviewRow[];
  classified: PreviewRow[];
  duplicates: PreviewRow[];
}

export interface ImportTotals {
  byBloc: Record<Bloc, number>;
  incomeCents: number;
  toClassifyCount: number;
  toCreateCount: number;
}

export function initialChoice(row: PreviewRow): ImportTarget | null {
  if (row.duplicate) {
    return 'IGNORE';
  }
  const target = row.suggestion.target;
  if (target === 'IGNORE') {
    return 'IGNORE';
  }
  if (target === 'INCOME' || row.amountCents > 0) {
    return 'INCOME';
  }
  return target;
}

export function initialChoices(rows: readonly PreviewRow[]): Choices {
  const choices: Choices = {};
  for (const row of rows) {
    choices[row.index] = initialChoice(row);
  }
  return choices;
}

export function groupRows(rows: readonly PreviewRow[]): RowGroups {
  const groups: RowGroups = { toClassify: [], classified: [], duplicates: [] };
  for (const row of rows) {
    if (row.duplicate) {
      groups.duplicates.push(row);
    } else if (initialChoice(row) === null) {
      groups.toClassify.push(row);
    } else {
      groups.classified.push(row);
    }
  }
  return groups;
}

export function computeTotals(rows: readonly PreviewRow[], choices: Choices): ImportTotals {
  const totals: ImportTotals = {
    byBloc: { FIXE: 0, COURANT: 0, PLAISIR: 0, EPARGNE: 0 },
    incomeCents: 0,
    toClassifyCount: 0,
    toCreateCount: 0,
  };
  for (const row of rows) {
    const choice = choices[row.index] ?? null;
    if (choice === null) {
      totals.toClassifyCount += 1;
    } else if (choice === 'INCOME') {
      totals.incomeCents += Math.abs(row.amountCents);
      totals.toCreateCount += 1;
    } else if (choice !== 'IGNORE') {
      totals.byBloc[choice] += Math.abs(row.amountCents);
      totals.toCreateCount += 1;
    }
  }
  return totals;
}

export function buildCommitItems(rows: readonly PreviewRow[], choices: Choices): CommitItem[] {
  const items: CommitItem[] = [];
  for (const row of rows) {
    const choice = choices[row.index] ?? null;
    if (choice === null || choice === 'IGNORE') {
      continue;
    }
    const kind: TransactionKind = choice === 'INCOME' ? 'INCOME' : 'EXPENSE';
    const bloc = choice === 'INCOME' ? undefined : choice;
    const label = row.label.trim() === '' ? defaultLabel(kind, bloc ?? 'COURANT') : row.label.slice(0, MAX_COMMIT_LABEL_LENGTH);
    const amountCents = Math.abs(row.amountCents);
    items.push(bloc ? { kind, bloc, label, amountCents, date: row.date } : { kind, label, amountCents, date: row.date });
  }
  return items;
}

export function dominantMonth(items: readonly { date: string }[]): string | null {
  const counts = new Map<string, number>();
  for (const item of items) {
    const month = item.date.slice(0, 7);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [month, count] of counts) {
    if (best === null || count > (counts.get(best) ?? 0) || (count === (counts.get(best) ?? 0) && month > best)) {
      best = month;
    }
  }
  return best;
}

export function isManualChoice(choice: ImportTarget | null, initial: ImportTarget | null): boolean {
  return choice !== null && choice !== initial;
}

export function keywordsByIndex(rows: readonly PreviewRow[]): Map<number, string> {
  const keywords = new Map<number, string>();
  for (const row of rows) {
    const keyword = deriveKeyword(row.label);
    if (keyword !== '') {
      keywords.set(row.index, keyword);
    }
  }
  return keywords;
}

export function findSimilarUnclassified(
  keywords: ReadonlyMap<number, string>,
  choices: Choices,
  sourceIndex: number,
): number[] {
  const keyword = keywords.get(sourceIndex);
  if (keyword === undefined) {
    return [];
  }
  const similar: number[] = [];
  for (const [index, other] of keywords) {
    if (index !== sourceIndex && other === keyword && (choices[index] ?? null) === null) {
      similar.push(index);
    }
  }
  return similar;
}

export function collectLearnedRules(
  rows: readonly PreviewRow[],
  choices: Choices,
  learn: Readonly<Record<number, string>>,
): LearnedRule[] {
  const learned: LearnedRule[] = [];
  for (const row of rows) {
    const keyword = learn[row.index];
    const choice = choices[row.index] ?? null;
    if (keyword !== undefined && choice !== null && isManualChoice(choice, initialChoice(row))) {
      learned.push({ keyword, target: choice });
    }
  }
  return learned;
}
