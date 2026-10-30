import {
  DEFAULT_RULES,
  classifyRow,
  normalizeText,
  validateRules,
} from './classification';

describe('classifyRow', () => {
  const rules = validateRules([
    { keyword: 'virement interne', target: 'IGNORE' },
    { keyword: 'livret', target: 'EPARGNE' },
    { keyword: 'carrefour', target: 'COURANT' },
    { keyword: 'carrefour city', target: 'PLAISIR' },
  ]);

  it('applies the first matching bloc rule, ignoring case and accents', () => {
    expect(classifyRow('CB CARREFOUR CITY PARIS', -1500, rules)).toEqual({
      target: 'COURANT',
      rule: 'carrefour',
    });
    expect(classifyRow('Prélèvement Livret A', -10000, rules)).toEqual({
      target: 'EPARGNE',
      rule: 'livret',
    });
  });

  it('puts an unknown label in « to classify »', () => {
    expect(classifyRow('CB SUPER U', -5800, rules)).toEqual({
      target: null,
      rule: null,
    });
  });

  it('treats any positive amount as income unless an IGNORE rule matches', () => {
    expect(classifyRow('VIR SALAIRE', 380000, rules)).toEqual({
      target: 'INCOME',
      rule: null,
    });
    expect(classifyRow('VIREMENT INTERNE COMPTE JOINT', 20000, rules)).toEqual({
      target: 'IGNORE',
      rule: 'virement interne',
    });
    expect(classifyRow('VIREMENT INTERNE COMPTE JOINT', -20000, rules)).toEqual(
      { target: 'IGNORE', rule: 'virement interne' },
    );
  });

  it('never classifies an expense as income through a rule', () => {
    const odd = validateRules([{ keyword: 'remboursement', target: 'INCOME' }]);
    expect(classifyRow('REMBOURSEMENT TROP PERCU', -500, odd)).toEqual({
      target: null,
      rule: null,
    });
  });

  it('ships default rules that are valid', () => {
    expect(() => validateRules(DEFAULT_RULES)).not.toThrow();
  });
});

describe('validateRules', () => {
  it('normalizes keywords', () => {
    expect(
      validateRules([{ keyword: '  Crèche  Municipale ', target: 'FIXE' }]),
    ).toEqual([{ keyword: 'creche municipale', target: 'FIXE' }]);
    expect(normalizeText('É  à')).toBe('e a');
  });

  it('rejects bad keywords, targets, duplicates and oversized sets', () => {
    expect(() => validateRules([{ keyword: 'a', target: 'FIXE' }])).toThrow(
      'Mot-cle',
    );
    expect(() =>
      validateRules([{ keyword: 'x'.repeat(41), target: 'FIXE' }]),
    ).toThrow('Mot-cle');
    expect(() =>
      validateRules([{ keyword: 'loyer', target: 'AUTRE' }]),
    ).toThrow('Cible');
    expect(() =>
      validateRules([
        { keyword: 'Loyer', target: 'FIXE' },
        { keyword: 'loyer', target: 'COURANT' },
      ]),
    ).toThrow('double');
    expect(() =>
      validateRules(
        Array.from({ length: 201 }, (_, i) => ({
          keyword: `mot${i}`,
          target: 'FIXE',
        })),
      ),
    ).toThrow('Trop');
  });
});
