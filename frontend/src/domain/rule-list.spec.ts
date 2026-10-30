import { describe, expect, it } from 'vitest';
import { addRule, moveRule, removeRule } from './rule-list';

const rules = [
  { keyword: 'a1', target: 'FIXE' as const },
  { keyword: 'b2', target: 'COURANT' as const },
  { keyword: 'c3', target: 'IGNORE' as const },
];

describe('rule list editing', () => {
  it('moves a rule up and down without mutating', () => {
    expect(moveRule(rules, 1, -1).map((rule) => rule.keyword)).toEqual(['b2', 'a1', 'c3']);
    expect(moveRule(rules, 1, 1).map((rule) => rule.keyword)).toEqual(['a1', 'c3', 'b2']);
    expect(rules.map((rule) => rule.keyword)).toEqual(['a1', 'b2', 'c3']);
  });

  it('ignores moves outside the list', () => {
    expect(moveRule(rules, 0, -1)).toEqual(rules);
    expect(moveRule(rules, 2, 1)).toEqual(rules);
  });

  it('removes a rule', () => {
    expect(removeRule(rules, 0).map((rule) => rule.keyword)).toEqual(['b2', 'c3']);
  });

  it('adds a trimmed rule at the end', () => {
    const result = addRule(rules, '  cinema ', 'PLAISIR');
    expect(result).toEqual({ ok: true, rules: [...rules, { keyword: 'cinema', target: 'PLAISIR' }] });
  });

  it('refuses short keywords and duplicates', () => {
    expect(addRule(rules, 'x', 'FIXE')).toMatchObject({ ok: false });
    expect(addRule(rules, 'B2', 'FIXE')).toEqual({ ok: false, error: 'Une règle existe déjà pour ce mot-clé.' });
  });
});
