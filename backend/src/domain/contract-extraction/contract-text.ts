import { MAX_SNIPPET_LENGTH } from './extraction.types';

/** Une ligne lisible du document, avec sa version « pliée » pour la recherche. */
export interface Line {
  /** Texte normalisé (accents et casse d'origine ; les séparations de colonnes de 2 espaces ou plus sont conservées). */
  text: string;
  /** Minuscules sans accents, MÊME longueur que `text` (les indices correspondent). */
  fold: string;
  /** Numéro de page, à partir de 1. */
  page: number;
  /** Ligne reconstituée (tableau « en-tête / valeur »), pas une ligne du document. */
  virtual: boolean;
}

// Les classes de caractères sont construites depuis des chaînes échappées : les espaces
// insécables et invisibles ne doivent jamais apparaître tels quels dans le code source.
const INVISIBLE = new RegExp('[\\u00AD\\u200B-\\u200D\\u2060\\uFEFF]', 'g');
const LIGATURE = new RegExp('[\\uFB00-\\uFB04]', 'g');
const SPACES = new RegExp('[\\u00A0\\u2000-\\u200A\\u202F\\u205F\\u3000]', 'g');
const APOSTROPHES = new RegExp('[\\u2019\\u2018\\u02BC\\u00B4`\\u2032]', 'g');
const QUOTES = new RegExp('[\\u201C\\u201D\\u201E]', 'g');
const DASHES = new RegExp('[\\u2013\\u2014\\u2212\\u2012]', 'g');
// oxlint-disable-next-line no-control-regex -- on retire justement les caractères de contrôle
const CONTROLS = new RegExp('[\\u0000-\\u0009\\u000B-\\u001F\\u007F]', 'g');

/** Normalise un texte brut (PDF ou OCR) : espaces insécables et fines, apostrophes, tirets, ligatures. */
export function normalizeText(raw: string): string {
  let text = raw.normalize('NFC');
  text = text.replace(INVISIBLE, '');
  text = text.replace(LIGATURE, (ligature) => ligature.normalize('NFKD'));
  text = text.replace(SPACES, ' ');
  text = text.replace(APOSTROPHES, "'");
  text = text.replace(QUOTES, '"');
  text = text.replace(DASHES, '-');
  text = text.replace(/\r\n?/g, '\n').replace(/\f/g, '\n');
  text = text.replace(/\t/g, '  ');
  text = text.replace(CONTROLS, '');
  // Points de conduite et traits de formulaire : ils séparent un libellé de sa valeur.
  text = text.replace(/(?:\.\s?){3,}|\u2026+|_{3,}|\u00B7{2,}/g, '  ');
  return text;
}

/** Même longueur que l'entrée : minuscules, sans accents (les caractères sans équivalent simple restent tels quels). */
export function foldText(text: string): string {
  let out = '';
  for (const ch of text) {
    const base = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    out += base.length === ch.length ? base : ch;
  }
  return out;
}

function toLine(text: string, page: number, virtual: boolean): Line {
  return { text, fold: foldText(text), page, virtual };
}

/** Lignes non vides d'une page, sans espaces de bord. */
function pageLines(text: string, page: number): Line[] {
  return normalizeText(text)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => toLine(line, page, false));
}

function cellsOf(text: string): string[] {
  return text
    .split(/\s{2,}/)
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0);
}

/**
 * Tableaux « en-têtes puis valeurs » : une ligne d'en-têtes sans chiffres suivie d'une
 * ligne de même nombre de cellules, à majorité numériques, donne des lignes
 * reconstituées « en-tête : valeur » que les règles lisent comme les autres.
 */
function tableLines(lines: Line[]): Line[] {
  const virtual: Line[] = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    const head = lines[i];
    const data = lines[i + 1];
    if (head.virtual || data.virtual || head.page !== data.page) {
      continue;
    }
    const headCells = cellsOf(head.text);
    const dataCells = cellsOf(data.text);
    if (headCells.length < 2 || headCells.length !== dataCells.length) {
      continue;
    }
    if (headCells.some((cell) => /\d/.test(cell) || !/\p{L}/u.test(cell))) {
      continue;
    }
    const numeric = dataCells.filter((cell) => /\d/.test(cell)).length;
    if (numeric * 2 < dataCells.length) {
      continue;
    }
    headCells.forEach((cell, index) => {
      virtual.push(toLine(`${cell} : ${dataCells[index]}`, head.page, true));
    });
  }
  return virtual;
}

/** Toutes les lignes du document (pages dans l'ordre) puis les lignes de tableau reconstituées. */
export function buildLines(pages: readonly string[]): Line[] {
  const lines: Line[] = [];
  pages.forEach((text, index) => {
    lines.push(...pageLines(text, index + 1));
  });
  return [...lines, ...tableLines(lines)];
}

const IBAN = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b/g;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE = /(?:\+33|0033|\b0)\s?[1-9](?:[\s.-]?\d{2}){4}\b/g;
const LONG_DIGITS = /\d(?:[ .]?\d){8,}/g;

/** Retire d'un extrait les données sensibles autres que la valeur justifiée (IBAN, e-mail, téléphone, longs numéros). */
function redact(text: string): string {
  return text
    .replace(EMAIL, '…')
    .replace(IBAN, '…')
    .replace(PHONE, '…')
    .replace(LONG_DIGITS, '…');
}

export function collapseSpaces(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export interface SnippetSpan {
  labelLine: Line;
  labelStart: number;
  valueLine: Line;
  valueStart: number;
  valueEnd: number;
}

const UNIT = String.raw`(?:€|euros?\b|eur\b|%|pour\s+cent|mois\b|ans?\b|annees?\b|par\s+mois|par\s+an|\/\s*mois|l'an\b|mensualites\b|echeances\b)`;
const UNIT_TAIL = new RegExp(`^(?:\\s*${UNIT}){1,3}`, 'i');

/**
 * Extrait justificatif : du début du libellé à la fin de la valeur (+ unité), espaces
 * normalisés, données sensibles masquées hors de la valeur elle-même, 140 caractères au plus.
 */
export function makeSnippet(span: SnippetSpan): string {
  const { labelLine, labelStart, valueLine, valueStart, valueEnd } = span;
  const tail = UNIT_TAIL.exec(foldText(valueLine.text.slice(valueEnd)));
  const end = valueEnd + (tail ? tail[0].length : 0);
  const value = valueLine.text.slice(valueStart, valueEnd);
  const after = redact(valueLine.text.slice(valueEnd, end));
  let snippet: string;
  if (labelLine === valueLine) {
    const lead = Math.max(0, Math.min(labelStart, valueStart));
    const before = redact(valueLine.text.slice(lead, valueStart));
    snippet = collapseSpaces(`${before}${value}${after}`);
  } else {
    const label = redact(labelLine.text.slice(labelStart));
    const before = redact(valueLine.text.slice(0, valueStart));
    snippet = collapseSpaces(`${label} ${before}${value}${after}`);
  }
  if (snippet.length > MAX_SNIPPET_LENGTH) {
    // La valeur doit rester dans l'extrait : on coupe plutôt le début.
    const valueText = collapseSpaces(value + after);
    const room = MAX_SNIPPET_LENGTH - valueText.length - 2;
    snippet =
      room > 10 && snippet.endsWith(valueText)
        ? `…${snippet.slice(snippet.length - valueText.length - room)}`
        : `${snippet.slice(0, MAX_SNIPPET_LENGTH - 1).trimEnd()}…`;
    snippet = snippet.slice(0, MAX_SNIPPET_LENGTH);
  }
  return snippet;
}

const FUNCTION_WORDS = new Set(
  (
    'le la les un une des du de et en au aux ce ces cet cette son sa ses leur leurs ' +
    'pour par sur sous dans avec sans est sont ont dont que qui ou ne pas plus ' +
    'se si il elle vous nous votre vos notre nos au selon entre vers chez lors ' +
    'ainsi comme aussi tout tous toute toutes pret credit taux montant duree ' +
    'article conditions contrat'
  ).split(' '),
);

export interface TextQuality {
  /** Caractères non blancs. */
  usableChars: number;
  tooShort: boolean;
  poor: boolean;
}

const MIN_USABLE_CHARS = 80;

/**
 * Qualité du texte lu : proportion de caractères étranges (hors lettres, chiffres et
 * ponctuation courante), de mots « suspects » (chiffres mêlés aux lettres, aucune
 * voyelle, longues suites de consonnes) et de mots-outils français reconnus.
 */
export function assessTextQuality(text: string): TextQuality {
  const compact = text.replace(/\s+/g, '');
  const usableChars = compact.length;
  if (usableChars < MIN_USABLE_CHARS) {
    return { usableChars, tooShort: true, poor: false };
  }
  const weird = compact.replace(
    /[\p{L}\p{N}.,;:!?'"()%€$&/\-+*=°«»@#_[\]]/gu,
    '',
  ).length;
  const weirdRatio = weird / usableChars;

  const words = (text.match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) =>
    /\p{L}/u.test(w),
  );
  let suspects = 0;
  let longWords = 0;
  let known = 0;
  for (const word of words) {
    const folded = foldText(word);
    if (FUNCTION_WORDS.has(folded)) {
      known += 1;
    }
    if (word.length < 4 || word === word.toUpperCase()) {
      continue;
    }
    longWords += 1;
    const mixed = /\d/.test(word);
    const noVowel = !/[aeiouy]/.test(folded);
    const consonantRun = /[bcdfghjklmnpqrstvwxz]{5,}/.test(folded);
    if (mixed || noVowel || consonantRun) {
      suspects += 1;
    }
  }
  const suspectRatio = longWords > 0 ? suspects / longWords : 0;
  const knownRatio = words.length > 0 ? known / words.length : 0;
  const poor =
    weirdRatio > 0.06 ||
    (longWords >= 15 && suspectRatio > 0.12) ||
    (words.length >= 80 && knownRatio < 0.08);
  return { usableChars, tooShort: false, poor };
}
