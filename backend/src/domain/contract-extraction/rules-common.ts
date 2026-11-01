import { Line, makeSnippet } from './contract-text';
import {
  Confidence,
  ExtractedField,
  ExtractionFieldName,
  capConfidence,
  confidenceRank,
} from './extraction.types';
import { NumberToken, numberTokens } from './numbers';

/** Valeur lue dans une ligne, à des positions précises de `line.text`. */
export interface Scanned<V> {
  value: V;
  corrected: boolean;
  start: number;
  end: number;
}

export interface LabelHit {
  lineIndex: number;
  line: Line;
  start: number;
  end: number;
}

export type Scanner<V> = (
  line: Line,
  from: number,
  limit: number,
) => Scanned<V> | null;

export interface ValueHit<V> extends Scanned<V> {
  label: LabelHit;
  /** Ligne où la valeur a été lue (la suivante si le libellé était seul sur sa ligne). */
  line: Line;
  viaNextLine: boolean;
  /** Texte plié entre le début du libellé et la valeur (pour écarter les libellés trompeurs). */
  segment: string;
}

/** Tous les passages d'une ligne qui correspondent à `pattern` (appliqué au texte plié). */
export function findLabels(
  lines: readonly Line[],
  pattern: RegExp,
): LabelHit[] {
  const hits: LabelHit[] = [];
  const flags = pattern.flags.includes('g')
    ? pattern.flags
    : `${pattern.flags}g`;
  lines.forEach((line, lineIndex) => {
    const re = new RegExp(pattern.source, flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(line.fold)) !== null) {
      if (match[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      hits.push({
        lineIndex,
        line,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  });
  return hits;
}

function cellCount(text: string): number {
  return text.split(/\s{2,}/).filter((cell) => cell.trim().length > 0).length;
}

const MAX_GAP = 110;

/**
 * Valeur qui suit un libellé : sur la même ligne (au plus ~110 caractères, premier jeton
 * seulement), sinon sur la ligne suivante quand le libellé est seul sur sa ligne.
 */
export function valueAfter<V>(
  lines: readonly Line[],
  hit: LabelHit,
  scan: Scanner<V>,
): ValueHit<V> | null {
  const same = scan(hit.line, hit.end, hit.end + MAX_GAP);
  if (same) {
    return {
      ...same,
      label: hit,
      line: hit.line,
      viaNextLine: false,
      segment: hit.line.fold.slice(hit.start, same.start),
    };
  }
  const restOfLine = hit.line.text.slice(hit.end);
  const next = lines[hit.lineIndex + 1];
  if (
    next &&
    !next.virtual &&
    !hit.line.virtual &&
    next.page === hit.line.page &&
    !/\d/.test(restOfLine) &&
    cellCount(hit.line.text) <= 1
  ) {
    const found = scan(next, 0, 70);
    if (found) {
      return {
        ...found,
        label: hit,
        line: next,
        viaNextLine: true,
        segment: `${hit.line.fold.slice(hit.start)} ${next.fold.slice(0, found.start)}`,
      };
    }
  }
  return null;
}

/** Identifiant de l'endroit où la valeur a été lue (dédoublonnage de libellés qui se recouvrent). */
export function valuePosition<V>(hit: ValueHit<V>): string {
  return `${hit.label.lineIndex + (hit.viaNextLine ? 1 : 0)}:${hit.start}`;
}

export function snippetOf<V>(hit: ValueHit<V>): string {
  return makeSnippet({
    labelLine: hit.label.line,
    labelStart: hit.label.start,
    valueLine: hit.line,
    valueStart: hit.start,
    valueEnd: hit.end,
  });
}

/** Premier jeton numérique (avec vrai chiffre) à partir de `from`, dans la fenêtre `limit`. */
export function firstToken(
  line: Line,
  from: number,
  limit: number,
): NumberToken | null {
  const tokens = numberTokens(line.text, from);
  const first = tokens[0];
  return first && first.start < limit ? first : null;
}

/** Jeton numérique qui se termine juste avant `index` (au plus un espace entre les deux). */
export function numberTokensBefore(
  line: Line,
  index: number,
): NumberToken | null {
  const tokens = numberTokens(line.text);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    if (token.end <= index && index - token.end <= 1) {
      return token;
    }
  }
  return null;
}

export interface Candidate<V> {
  value: V;
  key: string;
  level: Confidence;
  corrected: boolean;
  snippet: string;
  page: number;
  order: number;
}

export function makeCandidate<V>(
  hit: ValueHit<V>,
  key: string,
  level: Confidence,
): Candidate<V> {
  return {
    value: hit.value,
    key,
    level: hit.corrected ? capConfidence(level, 'MEDIUM') : level,
    corrected: hit.corrected,
    snippet: snippetOf(hit),
    page: hit.line.page,
    order: hit.label.lineIndex,
  };
}

export interface Picked<V> {
  best: Candidate<V>;
  /** Confiance finale (plafonnée à MEDIUM si plusieurs valeurs plausibles). */
  confidence: Confidence;
  /** Valeurs plausibles distinctes, la plus probable en premier. */
  plausible: Candidate<V>[];
  ambiguous: boolean;
}

interface Group<V> {
  rep: Candidate<V>;
  rank: number;
  count: number;
}

/**
 * Choisit la valeur la plus probable : meilleur niveau de confiance, puis la plus répétée,
 * puis la première du document. Plusieurs valeurs distinctes plausibles → ambiguïté
 * (confiance au mieux MEDIUM) que l'appelant signale par un avertissement. Avec
 * `sameLevelOnly`, seules les valeurs du même niveau que la meilleure comptent.
 */
export function pickBest<V>(
  candidates: readonly Candidate<V>[],
  sameLevelOnly = false,
): Picked<V> | null {
  if (candidates.length === 0) {
    return null;
  }
  const groups = new Map<string, Group<V>>();
  for (const candidate of candidates) {
    const rank = confidenceRank(candidate.level);
    const group = groups.get(candidate.key);
    if (!group) {
      groups.set(candidate.key, { rep: candidate, rank, count: 1 });
      continue;
    }
    group.count += 1;
    if (
      rank > group.rank ||
      (rank === group.rank && candidate.order < group.rep.order)
    ) {
      group.rank = rank;
      group.rep = candidate;
    }
  }
  const ordered = [...groups.values()].sort(
    (a, b) => b.rank - a.rank || b.count - a.count || a.rep.order - b.rep.order,
  );
  const top = ordered[0];
  const threshold = top.rank === 1 ? 1 : 2;
  const plausible = ordered.filter((g) =>
    sameLevelOnly ? g.rank === top.rank : g.rank >= threshold,
  );
  const ambiguous = plausible.length >= 2;
  return {
    best: top.rep,
    confidence: ambiguous
      ? capConfidence(top.rep.level, 'MEDIUM')
      : top.rep.level,
    plausible: plausible.map((g) => g.rep),
    ambiguous,
  };
}

export function fieldOf<V extends string | number>(
  field: ExtractionFieldName,
  picked: Picked<V>,
  confidence: Confidence = picked.confidence,
): ExtractedField {
  return {
    field,
    value: picked.best.value,
    confidence,
    snippet: picked.best.snippet,
    page: picked.best.page,
  };
}

/** « a », « a et b », « a, b et c ». */
export function joinFrench(items: readonly string[]): string {
  if (items.length <= 1) {
    return items.join('');
  }
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

/** Retire des segments les mentions « hors assurance » avant de chercher le mot « assurance ». */
export function stripNoInsuranceMentions(segment: string): string {
  return segment.replace(
    /(?:hors|sans|non\s+compris(?:e|es)?|exclu(?:e|es)?)\s+(?:de\s+l['\s])?(?:cotisations?\s+(?:d['\s]|de\s+l['\s])?)?assurances?|assurances?\s+(?:non\s+comprise|exclue|facultative\s+exclue)/g,
    ' ',
  );
}
