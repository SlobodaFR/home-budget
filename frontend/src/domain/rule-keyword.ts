import type { ImportTarget, Rule } from './statement-import';

export const MIN_KEYWORD_LENGTH = 2;
export const MAX_KEYWORD_LENGTH = 40;
export const MAX_RULES = 200;

const GENERIC_TOKENS = new Set([
  'prlv', 'prelevement', 'prelev', 'cb', 'vir', 'virement', 'virt', 'carte', 'paiement', 'pmt', 'pai', 'achat',
  'sepa', 'inst', 'instantane', 'retrait', 'dab', 'cheque', 'chq', 'facture', 'fact', 'ref', 'reference', 'mandat',
  'mdt', 'echeance', 'ech', 'num', 'numero', 'debit', 'credit', 'les', 'des', 'aux', 'par', 'pour', 'sur', 'avec',
  'www', 'com', 'net', 'org', 'eur', 'janv', 'fevr', 'avr', 'juin', 'juil', 'aout', 'sept', 'oct', 'nov', 'dec',
  'jan', 'fev', 'mar', 'mars',
]);

const SHORT_WORD_LENGTH = 4;
const MIN_WORD_LENGTH = 3;
const REFERENCE_DIGITS = 3;

export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function normalizeKeyword(keyword: string): string {
  return normalizeText(keyword).replace(/\s+/g, ' ').trim();
}

function significantWords(label: string): string[] {
  return normalizeText(label)
    .split(/[^a-z0-9]+/)
    .filter((token) => token !== '' && (token.match(/\d/g)?.length ?? 0) < REFERENCE_DIGITS)
    .map((token) => token.replace(/\d+/g, ''))
    .filter((token) => token.length >= MIN_WORD_LENGTH && !GENERIC_TOKENS.has(token));
}

export function deriveKeyword(label: string): string {
  const [first, second] = significantWords(label);
  if (!first) {
    return '';
  }
  const keyword = first.length < SHORT_WORD_LENGTH && second ? `${first} ${second}` : first;
  return keyword.slice(0, MAX_KEYWORD_LENGTH);
}

export function keywordError(keyword: string): string | null {
  const length = keyword.trim().length;
  return length >= MIN_KEYWORD_LENGTH && length <= MAX_KEYWORD_LENGTH
    ? null
    : `Le mot-clé doit faire entre ${MIN_KEYWORD_LENGTH} et ${MAX_KEYWORD_LENGTH} caractères.`;
}

export interface LearnedRule {
  keyword: string;
  target: ImportTarget;
}

export interface MergeResult {
  rules: Rule[];
  added: number;
}

export function mergeLearnedRules(existing: readonly Rule[], learned: readonly LearnedRule[]): MergeResult {
  const known = new Set(existing.map((rule) => normalizeKeyword(rule.keyword)));
  const rules = [...existing];
  let added = 0;
  for (const rule of learned) {
    const keyword = rule.keyword.trim();
    const key = normalizeKeyword(keyword);
    if (keywordError(keyword) === null && !known.has(key) && rules.length < MAX_RULES) {
      known.add(key);
      rules.push({ keyword, target: rule.target });
      added += 1;
    }
  }
  return { rules, added };
}
