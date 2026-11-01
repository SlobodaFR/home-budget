/**
 * Lecture des nombres d'un contrat français, tout en entiers (aucun flottant) :
 * « 150 000,00 € », « 150.000 euros », « 3,45 % ». Les confusions classiques de
 * l'OCR (O→0, l/I/|→1, S→5, B→8) ne sont corrigées QU'À L'INTÉRIEUR d'un jeton
 * numérique (qui contient au moins un vrai chiffre, majoritaire) ; la valeur est
 * alors marquée « corrigée » et plafonnée en confiance par l'appelant.
 */

/** Caractères pouvant représenter un chiffre (vrai chiffre ou confusion OCR). */
export const DIGIT_CLASS = '[0-9OoIlSB|]';

const CONFUSIONS: Record<string, string> = {
  O: '0',
  o: '0',
  I: '1',
  l: '1',
  '|': '1',
  S: '5',
  B: '8',
};

const MAX_INTEGER_DIGITS = 13;

export interface CorrectedDigits {
  digits: string;
  corrected: boolean;
}

/**
 * Remplace les confusions OCR par leur chiffre. Refuse un jeton sans aucun vrai
 * chiffre : « Sol », « Il » ou « OB » sont des mots, pas des nombres.
 */
export function correctDigits(token: string): CorrectedDigits | null {
  let real = 0;
  let confused = 0;
  let out = '';
  for (const ch of token) {
    if (ch >= '0' && ch <= '9') {
      real += 1;
      out += ch;
    } else if (ch in CONFUSIONS) {
      confused += 1;
      out += CONFUSIONS[ch];
    } else {
      out += ch;
    }
  }
  if (real === 0) {
    return null;
  }
  return { digits: out, corrected: confused > 0 };
}

export interface NumberToken {
  raw: string;
  start: number;
  end: number;
}

const TOKEN_PATTERN = new RegExp(
  `(?<![\\p{L}\\d])${DIGIT_CLASS}(?:${DIGIT_CLASS}|[ .,'](?=${DIGIT_CLASS}))*(?![\\p{L}\\d])`,
  'gu',
);

/**
 * Jetons numériques candidats de `text` à partir de `from` : suites de chiffres
 * (ou de confusions OCR) séparées par un seul espace, point, virgule ou apostrophe.
 * Les jetons sans vrai chiffre sont ignorés.
 */
export function numberTokens(text: string, from = 0): NumberToken[] {
  const tokens: NumberToken[] = [];
  const pattern = new RegExp(TOKEN_PATTERN.source, TOKEN_PATTERN.flags);
  pattern.lastIndex = from;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (correctDigits(match[0])) {
      tokens.push({
        raw: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }
  return tokens;
}

export interface ParsedAmount {
  cents: number;
  corrected: boolean;
  /** Le jeton portait des décimales (« ,00 »). */
  hasDecimals: boolean;
  /** Le jeton portait un séparateur de milliers. */
  grouped: boolean;
  /** Longueur du jeton consommé (utile si on a dû couper la fin du jeton). */
  consumed: number;
}

const GROUP_SEPARATORS = /[ .,']/;

function parseCorrectedAmount(
  value: string,
): Omit<ParsedAmount, 'corrected' | 'consumed'> | null {
  const decimal = /^(\d+(?:[ .,']\d{3})*)[,.](\d{1,2})$/.exec(value);
  const thousandsOnly = /^\d{1,3}(?:[ .,']\d{3})+$/.exec(value);
  const plain = /^\d+$/.exec(value);
  let integerPart: string;
  let fraction = '';
  let grouped = false;
  if (decimal) {
    const head = decimal[1];
    if (/[ .,']/.test(head) && !/^\d{1,3}(?:[ .,']\d{3})+$/.test(head)) {
      return null;
    }
    grouped = GROUP_SEPARATORS.test(head);
    integerPart = head.replace(/[ .,']/g, '');
    fraction = decimal[2];
  } else if (thousandsOnly) {
    grouped = true;
    integerPart = value.replace(/[ .,']/g, '');
  } else if (plain) {
    integerPart = value;
  } else {
    return null;
  }
  integerPart = integerPart.replace(/^0+(?=\d)/, '');
  if (integerPart.length > MAX_INTEGER_DIGITS) {
    return null;
  }
  const cents = Number(integerPart) * 100 + Number(fraction.padEnd(2, '0'));
  return { cents, hasDecimals: fraction !== '', grouped };
}

/**
 * Montant en centimes entiers. Accepte « 150 000,00 », « 150.000 », « 1.500,5 »,
 * « 1,500.00 », « 850 ». Si le jeton est trop long (« 850,00 240 »), on retire les
 * groupes de fin jusqu'à obtenir un montant valide.
 */
export function parseAmount(raw: string): ParsedAmount | null {
  let candidate = raw.trim();
  let cutAny = false;
  while (candidate.length > 0) {
    const fixed = correctDigits(candidate);
    if (fixed) {
      const parsed = parseCorrectedAmount(fixed.digits);
      // Un jeton raccourci n'est sûr que s'il se termine par des décimales (« 850,00 »).
      if (parsed && (!cutAny || parsed.hasDecimals)) {
        return {
          ...parsed,
          corrected: fixed.corrected,
          consumed: candidate.length,
        };
      }
    }
    const cut = Math.max(
      candidate.lastIndexOf(' '),
      candidate.lastIndexOf("'"),
    );
    if (cut <= 0) {
      return null;
    }
    candidate = candidate.slice(0, cut);
    cutAny = true;
  }
  return null;
}

export interface ParsedPercent {
  hundredths: number;
  corrected: boolean;
}

export type PercentParse = ParsedPercent | 'TOO_PRECISE' | null;

/** Pourcentage « 3,45 » → 345 centièmes de pourcent (3 décimales acceptées si la dernière vaut 0). */
export function parsePercent(raw: string): PercentParse {
  const fixed = correctDigits(raw.trim());
  if (!fixed) {
    return null;
  }
  const match = /^(\d{1,3})(?:[,.](\d{1,4}))?$/.exec(fixed.digits);
  if (!match) {
    return null;
  }
  let fraction = (match[2] ?? '').replace(/0+$/, '');
  if (fraction.length > 2) {
    return 'TOO_PRECISE';
  }
  fraction = fraction.padEnd(2, '0');
  return {
    hundredths: Number(match[1]) * 100 + Number(fraction),
    corrected: fixed.corrected,
  };
}

export interface ParsedInteger {
  value: number;
  corrected: boolean;
}

/** Entier simple (durées) ; null si ce n'est pas une suite de chiffres. */
export function parseInteger(raw: string): ParsedInteger | null {
  const fixed = correctDigits(raw.trim());
  if (!fixed || !/^\d{1,6}$/.test(fixed.digits)) {
    return null;
  }
  return { value: Number(fixed.digits), corrected: fixed.corrected };
}

export function formatEuros(cents: number): string {
  const euros = Math.trunc(cents / 100);
  const rest = String(cents % 100).padStart(2, '0');
  const grouped = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped},${rest} €`;
}

export function formatPercent(hundredths: number): string {
  const whole = Math.trunc(hundredths / 100);
  const rest = String(hundredths % 100).padStart(2, '0');
  return `${whole},${rest} %`;
}
