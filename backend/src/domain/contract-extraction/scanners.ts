import { numberTokens, parseAmount, parsePercent } from './numbers';
import { Scanner, firstToken } from './rules-common';

export interface AmountValue {
  cents: number;
  /** Devise lisible (€, EUR, euros) : la valeur est nette. */
  currency: boolean;
  /** Décimales (« ,00 ») ou séparateur de milliers : la valeur a la forme d'un montant. */
  shaped: boolean;
}

/** Premier montant après `from` (jeton numérique + devise facultative). */
export const scanAmount: Scanner<AmountValue> = (line, from, limit) => {
  const token = firstToken(line, from, limit);
  if (!token) {
    return null;
  }
  const parsed = parseAmount(token.raw);
  if (!parsed) {
    return null;
  }
  const end = token.start + parsed.consumed;
  const after = line.fold.slice(end);
  if (/^\s?%/.test(after) || /^\s?pour\s?cent/.test(after)) {
    return null;
  }
  const before = line.fold.slice(Math.max(0, token.start - 8), token.start);
  const currency =
    /^\s?(?:€|eur\b|euros?\b)/.test(after) ||
    /(?:€|eur|euros?)\s*$/.test(before);
  return {
    value: {
      cents: parsed.cents,
      currency,
      shaped: parsed.hasDecimals || parsed.grouped,
    },
    corrected: parsed.corrected,
    start: token.start,
    end,
  };
};

export interface PercentValue {
  /** null : plus de 2 décimales significatives. */
  hundredths: number | null;
  raw: string;
}

/**
 * Premier pourcentage après `from` (« 3,45 % », « 0,36 pour cent »). Un nombre qui n'est
 * pas suivi de « % » (« phase 1, … ») est sauté : seul un jeton suivi de % est un taux.
 */
export const scanPercent: Scanner<PercentValue> = (line, from, limit) => {
  for (const token of numberTokens(line.text, from)) {
    if (token.start >= limit) {
      return null;
    }
    const after = line.fold.slice(token.end);
    if (!/^\s?(?:%|pour\s?cent)/.test(after)) {
      continue;
    }
    const parsed = parsePercent(token.raw);
    if (parsed === null) {
      continue;
    }
    if (parsed === 'TOO_PRECISE') {
      return {
        value: { hundredths: null, raw: token.raw },
        corrected: false,
        start: token.start,
        end: token.end,
      };
    }
    return {
      value: { hundredths: parsed.hundredths, raw: token.raw },
      corrected: parsed.corrected,
      start: token.start,
      end: token.end,
    };
  }
  return null;
};
