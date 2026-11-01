import { ratePercentToHundredths } from '../debt/debt';
import { Line, makeSnippet } from './contract-text';
import { Confidence, ExtractedField, confidenceRank } from './extraction.types';
import { formatPercent } from './numbers';
import {
  Candidate,
  fieldOf,
  findLabels,
  joinFrench,
  makeCandidate,
  numberTokensBefore,
  pickBest,
  snippetOf,
  stripNoInsuranceMentions,
  valueAfter,
  valuePosition,
} from './rules-common';
import { PercentValue, scanPercent } from './scanners';

export interface RuleResult {
  fields: ExtractedField[];
  warnings: string[];
}

const RATE_LABELS: { pattern: RegExp; level: Confidence }[] = [
  { pattern: /taux\s+debiteur/, level: 'HIGH' },
  { pattern: /taux\s+nominal/, level: 'HIGH' },
  { pattern: /taux\s+d['\s]?\s?interets?/, level: 'HIGH' },
  { pattern: /taux\s+(?:fixe|variable|revisable|initial)\b/, level: 'HIGH' },
  {
    pattern: /taux\s+(?:du|de\s+ce|de\s+votre)\s+(?:pret|credit|financement)/,
    level: 'HIGH',
  },
  {
    pattern: /taux\s+(?:contractuel|conventionnel|client|applique|applicable)/,
    level: 'HIGH',
  },
  { pattern: /taux\s+annuel/, level: 'MEDIUM' },
  { pattern: /au\s+taux\s+(?:annuel\s+)?de/, level: 'MEDIUM' },
  { pattern: /\btaux\s*[:=]/, level: 'MEDIUM' },
  { pattern: /\btaux\s+de\b/, level: 'MEDIUM' },
];

/** Libellés qui ressemblent à un taux débiteur mais n'en sont pas. */
const NOT_DEBTOR_RATE =
  /taeg|\bteg\b|effectif|actuariel|assurance|cotisation|periodique|periode|proportionnel|mensuel|rendement|euribor|marge|indice|index|plafond|plancher|revision|variation|quotite|effort|endettement|\bcape?\b/;
const NOT_DEBTOR_LINE =
  /retard|penalit|indemnit|usure|taux\s+legal|interets?\s+legal|majoration|majore/;

const TAEG_LABEL =
  /taeg|t\.?\s?a\.?\s?e\.?\s?g\b\.?|taux\s+annuel\s+effectif\s+global|taux\s+effectif\s+global|\bteg\b/;

const PER_YEAR = /%\s*(?:l'an\b|par\s+an\b|annuel|\/\s?an\b|par\s+annee)/g;

function isValidRate(hundredths: number): boolean {
  try {
    return ratePercentToHundredths(hundredths / 100) === hundredths;
  } catch {
    return false;
  }
}

function rejectedRate(
  value: PercentValue,
  warnings: string[],
  level: Confidence,
): number | null {
  // Un libellé peu explicite qui précède un chiffre absurde n'est sans doute pas un taux : on se tait.
  const speak = level === 'HIGH';
  if (value.hundredths === null) {
    if (speak) {
      warnings.push(
        `Le taux lu (${value.raw} %) a plus de 2 décimales : il n'a pas été proposé.`,
      );
    }
    return null;
  }
  if (!isValidRate(value.hundredths)) {
    if (speak) {
      warnings.push(
        `Le taux lu (${value.raw} %) est hors limites (0 à 100 %) : il n'a pas été proposé.`,
      );
    }
    return null;
  }
  return value.hundredths;
}

/** TAEG lus dans le document (centièmes de pourcent), uniquement pour ne pas les confondre avec le taux débiteur. */
export function readTaeg(lines: readonly Line[]): number[] {
  const found: number[] = [];
  for (const hit of findLabels(lines, TAEG_LABEL)) {
    const value = valueAfter(lines, hit, scanPercent);
    const hundredths = value?.value.hundredths;
    if (typeof hundredths === 'number' && !found.includes(hundredths)) {
      found.push(hundredths);
    }
  }
  return found;
}

export function extractAnnualRate(
  lines: readonly Line[],
  taeg: readonly number[],
): RuleResult {
  const warnings: string[] = [];
  const byPosition = new Map<string, Candidate<number>>();
  const addBest = (candidate: Candidate<number>, position: string) => {
    const existing = byPosition.get(position);
    if (
      !existing ||
      confidenceRank(candidate.level) > confidenceRank(existing.level)
    ) {
      byPosition.set(position, candidate);
    }
  };

  for (const { pattern, level } of RATE_LABELS) {
    for (const label of findLabels(lines, pattern)) {
      if (NOT_DEBTOR_LINE.test(label.line.fold)) {
        continue;
      }
      const value = valueAfter(lines, label, scanPercent);
      if (!value) {
        continue;
      }
      if (NOT_DEBTOR_RATE.test(stripNoInsuranceMentions(value.segment))) {
        continue;
      }
      const hundredths = rejectedRate(value.value, warnings, level);
      if (hundredths === null) {
        continue;
      }
      addBest(
        makeCandidate(
          { ...value, value: hundredths },
          String(hundredths),
          level,
        ),
        valuePosition(value),
      );
    }
  }

  // « 3,45 % l'an » sans libellé : déduit, donc LOW.
  lines.forEach((line, lineIndex) => {
    if (NOT_DEBTOR_LINE.test(line.fold)) {
      return;
    }
    const re = new RegExp(PER_YEAR.source, 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(line.fold)) !== null) {
      const token = numberTokensBefore(line, match.index);
      if (!token) {
        continue;
      }
      const context = line.fold.slice(
        Math.max(0, token.start - 50),
        token.start,
      );
      if (NOT_DEBTOR_RATE.test(stripNoInsuranceMentions(context))) {
        continue;
      }
      const value = scanPercent(line, token.start, token.start + 1);
      if (!value) {
        continue;
      }
      const hundredths = rejectedRate(value.value, warnings, 'LOW');
      if (hundredths === null) {
        continue;
      }
      const label = { lineIndex, line, start: token.start, end: token.start };
      const hit = {
        ...value,
        value: hundredths,
        label,
        line,
        viaNextLine: false,
        segment: '',
      };
      addBest(
        {
          value: hundredths,
          key: String(hundredths),
          level: 'LOW',
          corrected: value.corrected,
          snippet: snippetOf(hit),
          page: line.page,
          order: lineIndex,
        },
        `${line.page}:${lineIndex}:${value.start}`,
      );
    }
  });

  const picked = pickBest([...byPosition.values()]);
  if (!picked) {
    if (taeg.length > 0) {
      warnings.push(
        `Seul le TAEG (${joinFrench(taeg.map(formatPercent))}) a été trouvé : il ne remplace pas le taux débiteur, saisissez celui-ci à la main.`,
      );
    }
    return { fields: [], warnings };
  }
  if (picked.ambiguous) {
    warnings.push(
      `Plusieurs taux trouvés (${joinFrench(picked.plausible.map((c) => formatPercent(c.value)))}) : vérifiez lequel est le taux débiteur.`,
    );
  }
  if (picked.best.level !== 'HIGH' && taeg.includes(picked.best.value)) {
    warnings.push(
      `Le taux retenu (${formatPercent(picked.best.value)}) est identique au TAEG : vérifiez qu'il s'agit bien du taux débiteur.`,
    );
  }
  const field = fieldOf('annualRatePercent', {
    ...picked,
    best: { ...picked.best, value: picked.best.value / 100 },
  });
  return { fields: [field], warnings };
}

// ---------------------------------------------------------------------------
// Type de taux

type RateKind = 'FIXED' | 'VARIABLE' | 'ADJUSTABLE';

const KIND_WORDS: { kind: RateKind; pattern: string }[] = [
  { kind: 'FIXED', pattern: 'fixe' },
  { kind: 'VARIABLE', pattern: 'variable|cape|plafonne|indexe' },
  { kind: 'ADJUSTABLE', pattern: 'revisable|ajustable' },
];

const KIND_ALL = KIND_WORDS.map((k) => k.pattern).join('|');
const NEAR_TAUX = new RegExp(
  `\\btaux\\b[^.;]{0,40}?\\b(${KIND_ALL})\\b|\\b(${KIND_ALL})\\b\\s+taux\\b`,
  'g',
);
const HIGH_FORMS: RegExp[] = [
  new RegExp(
    `(?:type|nature|mode|caracteristiques?)\\s+(?:du\\s+|de\\s+)?taux[^a-z]{0,8}(${KIND_ALL})\\b`,
  ),
  new RegExp(`\\ba\\s+taux\\s+(${KIND_ALL})\\b`),
  new RegExp(`\\btaux\\b[^.;:]{0,35}?\\b(${KIND_ALL})\\b\\s*(?:de|:)?\\s*\\d`),
  new RegExp(
    `\\btaux\\s+(?:d'?\\s?interets?\\s+)?(?:est\\s+)?(${KIND_ALL})\\b`,
  ),
];
const CHOICE_OR_NEGATION =
  /\b(?:fixe|variable|revisable|ajustable)\s*(?:ou|\/|,|et)\s*(?:fixe|variable|revisable|ajustable)\b|\b(?:pas|ni|non|sans)\b[^.;]{0,25}\b(?:fixe|variable|revisable|ajustable)\b|\bsi\b[^.;]{0,30}\b(?:variable|revisable)\b|\ben\s+cas\b/;

function kindOf(word: string): RateKind | null {
  for (const { kind, pattern } of KIND_WORDS) {
    if (new RegExp(`^(?:${pattern})$`).test(word)) {
      return kind;
    }
  }
  return null;
}

export function extractRateType(lines: readonly Line[]): RuleResult {
  const candidates: Candidate<string>[] = [];
  lines.forEach((line, lineIndex) => {
    if (line.virtual || CHOICE_OR_NEGATION.test(line.fold)) {
      return;
    }
    const re = new RegExp(NEAR_TAUX.source, 'g');
    const match = re.exec(line.fold);
    if (!match) {
      return;
    }
    const word = match[1] ?? match[2];
    const kind = kindOf(word);
    if (!kind) {
      return;
    }
    const high = HIGH_FORMS.some((form) => {
      const m = form.exec(line.fold);
      return m !== null && kindOf(m[1]) === kind;
    });
    const wordStart = match.index + match[0].indexOf(word);
    candidates.push({
      value: kind,
      key: kind,
      level: high ? 'HIGH' : 'MEDIUM',
      corrected: false,
      snippet: makeSnippet({
        labelLine: line,
        labelStart: match.index,
        valueLine: line,
        valueStart: wordStart,
        valueEnd: wordStart + word.length,
      }),
      page: line.page,
      order: lineIndex,
    });
  });
  const picked = pickBest(candidates, true);
  if (!picked) {
    return { fields: [], warnings: [] };
  }
  const warnings: string[] = [];
  if (picked.ambiguous) {
    warnings.push(
      'Le document évoque plusieurs types de taux (fixe, variable ou révisable) : vérifiez le type retenu.',
    );
  }
  return { fields: [fieldOf('rateType', picked)], warnings };
}
