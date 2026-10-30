import { describe, expect, it } from 'vitest';
import { deriveKeyword, keywordError, mergeLearnedRules, MAX_RULES } from './rule-keyword';

describe('deriveKeyword', () => {
  it.each([
    ['PRLV LOYER OCTOBRE 2026', 'loyer'],
    ['CB CARREFOUR MARKET 12/10', 'carrefour'],
    ['CARTE X1234 PAIEMENT CB 0210 BOULANGERIE PAUL', 'boulangerie'],
    ['PRLV SEPA EDF CLIENTS PARTICULIERS REF 4839201', 'edf clients'],
    ['VIR SEPA Jean Dupont', 'jean'],
    ['Prélèvement Électricité Été', 'electricite'],
    ['PAIEMENT PAR CARTE AMAZON.FR 75001 PARIS', 'amazon'],
    ['LECLERC33 FR7612345 12-10-2026', 'leclerc'],
  ])('derives a keyword from %s', (label, expected) => {
    expect(deriveKeyword(label)).toBe(expected);
  });

  it('keeps two words when the first one is short', () => {
    expect(deriveKeyword('PRLV EDF ENERGIE')).toBe('edf energie');
  });

  it('keeps a single short word when nothing follows', () => {
    expect(deriveKeyword('CB EDF 1234')).toBe('edf');
  });

  it('returns an empty keyword when nothing is significant', () => {
    expect(deriveKeyword('CB 12/10 1234 VIR')).toBe('');
    expect(deriveKeyword('')).toBe('');
  });

  it('never exceeds the server limit', () => {
    expect(deriveKeyword('a'.repeat(80)).length).toBeLessThanOrEqual(40);
  });
});

describe('keywordError', () => {
  it('accepts 2 to 40 characters', () => {
    expect(keywordError('ab')).toBeNull();
    expect(keywordError('a')).not.toBeNull();
    expect(keywordError(' a ')).not.toBeNull();
    expect(keywordError('x'.repeat(41))).not.toBeNull();
  });
});

describe('mergeLearnedRules', () => {
  const existing = [{ keyword: 'loyer', target: 'FIXE' as const }];

  it('appends new rules at the end', () => {
    const result = mergeLearnedRules(existing, [{ keyword: 'boulangerie', target: 'COURANT' }]);
    expect(result.rules).toEqual([...existing, { keyword: 'boulangerie', target: 'COURANT' }]);
    expect(result.added).toBe(1);
  });

  it('skips keywords already present, ignoring case and accents', () => {
    const result = mergeLearnedRules([{ keyword: 'Électricité', target: 'FIXE' }], [{ keyword: 'electricite', target: 'COURANT' }]);
    expect(result.added).toBe(0);
    expect(result.rules).toHaveLength(1);
  });

  it('skips duplicates among the new rules and invalid keywords', () => {
    const result = mergeLearnedRules(existing, [
      { keyword: 'cinema', target: 'PLAISIR' },
      { keyword: 'CINEMA', target: 'COURANT' },
      { keyword: 'x', target: 'COURANT' },
    ]);
    expect(result.rules.map((rule) => rule.keyword)).toEqual(['loyer', 'cinema']);
  });

  it('never goes beyond the server cap', () => {
    const full = Array.from({ length: MAX_RULES }, (_, index) => ({ keyword: `regle${index}`, target: 'COURANT' as const }));
    expect(mergeLearnedRules(full, [{ keyword: 'nouveau', target: 'FIXE' }]).added).toBe(0);
  });
});
