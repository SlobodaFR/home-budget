import { BLOCS } from '../shared/bloc';
import { DomainError } from '../shared/domain-error';

export const RULE_TARGETS = [...BLOCS, 'INCOME', 'IGNORE'] as const;
export type RuleTarget = (typeof RULE_TARGETS)[number];

export interface ClassificationRule {
  keyword: string;
  target: RuleTarget;
}

export interface Classification {
  target: RuleTarget | null;
  /** Mot-cle de la regle appliquee ; null si aucune (ou revenu automatique). */
  rule: string | null;
}

export const MAX_RULES = 200;
const MIN_KEYWORD = 2;
const MAX_KEYWORD = 40;

/** Jeu de depart, volontairement generique : chacun l'adapte a ses commercants. */
export const DEFAULT_RULES: ClassificationRule[] = [
  { keyword: 'virement interne', target: 'IGNORE' },
  { keyword: 'livret', target: 'EPARGNE' },
  { keyword: 'epargne', target: 'EPARGNE' },
  { keyword: 'loyer', target: 'FIXE' },
  { keyword: 'edf', target: 'FIXE' },
  { keyword: 'engie', target: 'FIXE' },
  { keyword: 'assurance', target: 'FIXE' },
  { keyword: 'mutuelle', target: 'FIXE' },
  { keyword: 'free', target: 'FIXE' },
  { keyword: 'orange', target: 'FIXE' },
  { keyword: 'sfr', target: 'FIXE' },
  { keyword: 'bouygues', target: 'FIXE' },
  { keyword: 'cantine', target: 'FIXE' },
  { keyword: 'creche', target: 'FIXE' },
  { keyword: 'impot', target: 'FIXE' },
  { keyword: 'credit', target: 'FIXE' },
  { keyword: 'pret', target: 'FIXE' },
  { keyword: 'carrefour', target: 'COURANT' },
  { keyword: 'leclerc', target: 'COURANT' },
  { keyword: 'auchan', target: 'COURANT' },
  { keyword: 'lidl', target: 'COURANT' },
  { keyword: 'intermarche', target: 'COURANT' },
  { keyword: 'monoprix', target: 'COURANT' },
  { keyword: 'pharmacie', target: 'COURANT' },
  { keyword: 'carburant', target: 'COURANT' },
  { keyword: 'station', target: 'COURANT' },
  { keyword: 'restaurant', target: 'PLAISIR' },
  { keyword: 'resto', target: 'PLAISIR' },
  { keyword: 'cinema', target: 'PLAISIR' },
  { keyword: 'netflix', target: 'PLAISIR' },
  { keyword: 'spotify', target: 'PLAISIR' },
  { keyword: 'amazon', target: 'PLAISIR' },
];

/** Minuscules, sans accents, espaces uniques : base de toutes les comparaisons. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Les regles IGNORE passent d'abord ; un montant positif est un revenu ; sinon la
 * premiere regle de bloc qui correspond (dans l'ordre) l'emporte. Aucune regle : a classer.
 */
export function classifyRow(
  label: string,
  amountCents: number,
  rules: ClassificationRule[],
): Classification {
  const text = normalizeText(label);
  const matches = (rule: ClassificationRule) => text.includes(rule.keyword);

  const ignore = rules.find(
    (rule) => rule.target === 'IGNORE' && matches(rule),
  );
  if (ignore) {
    return { target: 'IGNORE', rule: ignore.keyword };
  }
  if (amountCents > 0) {
    return { target: 'INCOME', rule: null };
  }
  const bloc = rules.find(
    (rule) =>
      rule.target !== 'IGNORE' && rule.target !== 'INCOME' && matches(rule),
  );
  return bloc
    ? { target: bloc.target, rule: bloc.keyword }
    : { target: null, rule: null };
}

/** Normalise et valide un jeu de regles saisi par l'utilisateur. */
export function validateRules(
  input: { keyword: string; target: string }[],
): ClassificationRule[] {
  if (input.length > MAX_RULES) {
    throw new DomainError(`Trop de regles (${MAX_RULES} au plus)`);
  }
  const seen = new Set<string>();
  return input.map(({ keyword, target }) => {
    const normalized = normalizeText(keyword);
    if (normalized.length < MIN_KEYWORD || normalized.length > MAX_KEYWORD) {
      throw new DomainError(
        `Mot-cle de ${MIN_KEYWORD} a ${MAX_KEYWORD} caracteres : « ${keyword} »`,
      );
    }
    if (!(RULE_TARGETS as readonly string[]).includes(target)) {
      throw new DomainError(`Cible de regle inconnue : ${target}`);
    }
    if (seen.has(normalized)) {
      throw new DomainError(`Mot-cle en double : « ${normalized} »`);
    }
    seen.add(normalized);
    return { keyword: normalized, target: target as RuleTarget };
  });
}
