import { keywordError, MAX_RULES, normalizeKeyword } from './rule-keyword';
import { ImportTarget, Rule } from './statement-import';

export function moveRule(rules: readonly Rule[], index: number, delta: -1 | 1): Rule[] {
  const target = index + delta;
  if (index < 0 || index >= rules.length || target < 0 || target >= rules.length) {
    return [...rules];
  }
  const next = [...rules];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function removeRule(rules: readonly Rule[], index: number): Rule[] {
  return rules.filter((_, position) => position !== index);
}

export type AddRuleResult = { ok: true; rules: Rule[] } | { ok: false; error: string };

export function addRule(rules: readonly Rule[], keyword: string, target: ImportTarget): AddRuleResult {
  const error = keywordError(keyword);
  if (error) {
    return { ok: false, error };
  }
  if (rules.length >= MAX_RULES) {
    return { ok: false, error: `Au plus ${MAX_RULES} règles.` };
  }
  const key = normalizeKeyword(keyword);
  if (rules.some((rule) => normalizeKeyword(rule.keyword) === key)) {
    return { ok: false, error: 'Une règle existe déjà pour ce mot-clé.' };
  }
  return { ok: true, rules: [...rules, { keyword: keyword.trim(), target }] };
}
