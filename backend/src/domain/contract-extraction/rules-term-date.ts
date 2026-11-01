import { isIsoDate } from '../shared/calendar';
import { MAX_INITIAL_TERM_MONTHS, MIN_INITIAL_TERM_MONTHS } from '../debt/debt';
import { Line } from './contract-text';
import { Confidence, capConfidence, confidenceRank } from './extraction.types';
import { DIGIT_CLASS, correctDigits, parseInteger } from './numbers';
import {
  Candidate,
  Scanner,
  fieldOf,
  findLabels,
  firstToken,
  joinFrench,
  makeCandidate,
  pickBest,
  valueAfter,
  valuePosition,
} from './rules-common';
import { RuleResult } from './rules-rate';

// ---------------------------------------------------------------------------
// Durée (en mois)

interface DurationValue {
  months: number;
  /** Années et mois exprimés de façon incohérente (« 20 ans (200 mois) »). */
  conflict: boolean;
  /** Nombre d'échéances supposées mensuelles, pas une durée explicite. */
  fromCount: boolean;
}

const D = DIGIT_CLASS;
const UNIT_RE = new RegExp(
  `(?<![\\p{L}\\d])(${D}{1,3})\\s?(ans?|ann[ée]es?|mois|mensualit[ée]s?|[ée]ch[ée]ances?)(?![\\p{L}])`,
  'giu',
);
const EXTRA_MONTHS_RE = new RegExp(
  `^\\s*(?:et|,|\\+)?\\s*(${D}{1,2})\\s?mois(?![\\p{L}])`,
  'iu',
);
const ALT_RE = new RegExp(
  `^\\s*(?:\\(|soit|ou|/)\\s*(?:environ\\s+|presque\\s+)?(${D}{1,3})\\s?(mois|ans?|ann[ée]es?)(?![\\p{L}])`,
  'iu',
);

function isYears(unit: string): boolean {
  return /^an/.test(unit);
}

const scanDuration: Scanner<DurationValue> = (line, from, limit) => {
  const re = new RegExp(UNIT_RE.source, UNIT_RE.flags);
  re.lastIndex = from;
  const match = re.exec(line.text);
  if (!match || match.index >= limit) {
    return null;
  }
  const first = parseInteger(match[1]);
  if (!first) {
    return null;
  }
  let corrected = first.corrected;
  const unit = foldMonth(match[2]);
  let end = match.index + match[0].length;
  let conflict = false;
  const fromCount = /^(?:mensualite|echeance)/.test(unit);
  let months = isYears(unit) ? first.value * 12 : first.value;

  const rest = line.text.slice(end);
  if (isYears(unit)) {
    const extra = EXTRA_MONTHS_RE.exec(rest);
    if (extra) {
      const extraMonths = parseInteger(extra[1]);
      if (extraMonths && extraMonths.value < 12) {
        months += extraMonths.value;
        corrected = corrected || extraMonths.corrected;
        end += extra[0].length;
      }
    }
  }
  const alt = ALT_RE.exec(line.text.slice(end));
  if (alt && !fromCount) {
    const altValue = parseInteger(alt[1]);
    if (altValue) {
      const altMonths = isYears(foldMonth(alt[2]))
        ? altValue.value * 12
        : altValue.value;
      // « 20 ans (240 mois) » ou « 240 mois soit 20 ans » : même durée, à un an près pour les années arrondies.
      const tolerance = isYears(foldMonth(alt[2])) || isYears(unit) ? 11 : 0;
      if (Math.abs(altMonths - months) > tolerance) {
        conflict = true;
      } else if (!isYears(foldMonth(alt[2]))) {
        months = altMonths;
      }
      corrected = corrected || altValue.corrected;
      end += alt[0].length;
    }
  }
  return {
    value: { months, conflict, fromCount },
    corrected,
    start: match.index,
    end,
  };
};

/** « Nombre d'échéances : 240 » : nombre nu, supposé mensuel. */
const scanBareCount: Scanner<DurationValue> = (line, from, limit) => {
  const token = firstToken(line, from, limit);
  if (!token) {
    return null;
  }
  const parsed = parseInteger(token.raw);
  if (!parsed) {
    return null;
  }
  return {
    value: { months: parsed.value, conflict: false, fromCount: true },
    corrected: parsed.corrected,
    start: token.start,
    end: token.end,
  };
};

const TERM_LABELS: { pattern: RegExp; level: Confidence }[] = [
  {
    pattern:
      /duree\s+(?:totale\s+|initiale\s+|contractuelle\s+)?(?:du\s+|de\s+l'|de\s+ce\s+|de\s+votre\s+)?(?:pret|credit|contrat|emprunt|financement|remboursement|amortissement)/,
    level: 'HIGH',
  },
  { pattern: /\bduree\s+(?:totale|initiale|contractuelle)/, level: 'HIGH' },
  { pattern: /(?:pour|sur)\s+une\s+duree\s+(?:totale\s+)?de/, level: 'HIGH' },
  { pattern: /\bduree\s*[:=]/, level: 'HIGH' },
  { pattern: /(?:remboursable|amortissable)\s+(?:en|sur)/, level: 'HIGH' },
  { pattern: /\bduree\b/, level: 'MEDIUM' },
  { pattern: /\ben\s+(?=\d)/, level: 'MEDIUM' },
];
const NOT_TERM_SEGMENT =
  /differe|validite|retractation|reflexion|delai|preavis|mobilisation|franchise|carence|assurance|garantie|offre|acceptation|anticipe|reservation|periode\s+de/;

export function extractTerm(lines: readonly Line[]): RuleResult {
  const warnings: string[] = [];
  const byPosition = new Map<string, Candidate<number>>();
  const add = (candidate: Candidate<number>, position: string) => {
    const existing = byPosition.get(position);
    if (
      !existing ||
      confidenceRank(candidate.level) > confidenceRank(existing.level)
    ) {
      byPosition.set(position, candidate);
    }
  };
  const consider = (
    hit: NonNullable<ReturnType<typeof valueAfter<DurationValue>>>,
    level: Confidence,
  ) => {
    if (NOT_TERM_SEGMENT.test(hit.segment)) {
      return;
    }
    const { months, conflict, fromCount } = hit.value;
    if (months < MIN_INITIAL_TERM_MONTHS || months > MAX_INITIAL_TERM_MONTHS) {
      warnings.push(
        `La durée lue (${months} mois) est hors limites (${MIN_INITIAL_TERM_MONTHS} à ${MAX_INITIAL_TERM_MONTHS} mois) : elle n'a pas été proposée.`,
      );
      return;
    }
    let finalLevel = level;
    if (fromCount) {
      finalLevel = capConfidence(finalLevel, 'MEDIUM');
    }
    if (conflict) {
      finalLevel = capConfidence(finalLevel, 'MEDIUM');
      warnings.push(
        `La durée du prêt est exprimée de deux façons qui ne concordent pas (${months} mois retenus) : vérifiez-la.`,
      );
    }
    add(
      makeCandidate({ ...hit, value: months }, String(months), finalLevel),
      valuePosition(hit),
    );
  };

  for (const { pattern, level } of TERM_LABELS) {
    for (const label of findLabels(lines, pattern)) {
      const hit = valueAfter(lines, label, scanDuration);
      if (hit) {
        consider(hit, level);
      }
    }
  }
  for (const label of findLabels(
    lines,
    /nombre\s+(?:total\s+)?(?:d'|de\s+)(?:echeances|mensualites|remboursements|versements)/,
  )) {
    const hit = valueAfter(lines, label, scanBareCount);
    if (hit) {
      consider(hit, 'MEDIUM');
    }
  }
  const picked = pickBest([...byPosition.values()]);
  if (!picked) {
    return { fields: [], warnings };
  }
  if (picked.ambiguous) {
    warnings.push(
      `Plusieurs durées trouvées (${joinFrench(picked.plausible.map((c) => `${c.value} mois`))}) : vérifiez la durée totale du prêt.`,
    );
  }
  return { fields: [fieldOf('initialTermMonths', picked)], warnings };
}

// ---------------------------------------------------------------------------
// Dates

const MONTHS: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
};
const NUMERIC_DATE = new RegExp(
  `(?<![\\p{L}\\d])(${D}{1,2})\\s?[/.\\-]\\s?(${D}{1,2})\\s?[/.\\-]\\s?(${D}{4})(?![\\p{L}\\d])`,
  'gu',
);
const TEXT_DATE = new RegExp(
  `(?<![\\p{L}\\d])(1er|${D}{1,2})\\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\\s+(${D}{4})(?![\\p{L}\\d])`,
  'giu',
);

function digitsOf(raw: string): { value: number; corrected: boolean } | null {
  if (raw === '1er') {
    return { value: 1, corrected: false };
  }
  const fixed = correctDigits(raw);
  if (!fixed || !/^\d+$/.test(fixed.digits)) {
    return null;
  }
  return { value: Number(fixed.digits), corrected: fixed.corrected };
}

const scanDate: Scanner<string> = (line, from, limit) => {
  const found: {
    index: number;
    length: number;
    d: string;
    m: string;
    y: string;
  }[] = [];
  for (const pattern of [NUMERIC_DATE, TEXT_DATE]) {
    const re = new RegExp(pattern.source, pattern.flags);
    re.lastIndex = from;
    const match = re.exec(line.text);
    if (match && match.index < limit) {
      found.push({
        index: match.index,
        length: match[0].length,
        d: match[1],
        m: match[2],
        y: match[3],
      });
    }
  }
  found.sort((a, b) => a.index - b.index);
  const first = found[0];
  if (!first) {
    return null;
  }
  const day = digitsOf(first.d);
  const month =
    foldMonth(first.m) in MONTHS
      ? { value: MONTHS[foldMonth(first.m)], corrected: false }
      : digitsOf(first.m);
  const year = digitsOf(first.y);
  if (!day || !month || !year) {
    return null;
  }
  const iso = `${String(year.value).padStart(4, '0')}-${String(month.value).padStart(2, '0')}-${String(day.value).padStart(2, '0')}`;
  if (!isIsoDate(iso) || year.value < 1980 || year.value > 2100) {
    return null;
  }
  return {
    value: iso,
    corrected: day.corrected || month.corrected || year.corrected,
    start: first.index,
    end: first.index + first.length,
  };
};

function foldMonth(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

const START_LABELS: RegExp[] = [
  /date\s+(?:de|du)\s+(?:debut|depart|demarrage|mise\s+a\s+disposition|deblocage|decaissement|versement\s+des\s+fonds|prise\s+d'effet|point\s+de\s+depart)/,
  /date\s+d'effet/,
  /debut\s+(?:du\s+pret|du\s+credit|de\s+l'amortissement|des\s+remboursements)/,
  /(?:mise\s+a\s+disposition|deblocage)\s+des\s+fonds\s+(?:le|:|au|a\s+compter\s+du)/,
];
const FIRST_PAYMENT_LABELS: RegExp[] = [
  /date\s+de\s+(?:la\s+)?(?:1(?:ere|re)|premiere)\s+(?:echeance|mensualite)/,
  /(?:1(?:ere|re)|premiere)\s+(?:echeance|mensualite)/,
  /date\s+du\s+premier\s+(?:remboursement|prelevement|versement)/,
  /premier\s+(?:remboursement|prelevement)/,
];

export function extractStartDate(lines: readonly Line[]): RuleResult {
  const byPosition = new Map<string, Candidate<string>>();
  const groups: [RegExp[], Confidence][] = [
    [START_LABELS, 'HIGH'],
    [FIRST_PAYMENT_LABELS, 'MEDIUM'],
  ];
  for (const [patterns, level] of groups) {
    for (const pattern of patterns) {
      for (const label of findLabels(lines, pattern)) {
        const hit = valueAfter(lines, label, scanDate);
        if (!hit) {
          continue;
        }
        const candidate = makeCandidate(hit, hit.value, level);
        const position = valuePosition(hit);
        const existing = byPosition.get(position);
        if (
          !existing ||
          confidenceRank(candidate.level) > confidenceRank(existing.level)
        ) {
          byPosition.set(position, candidate);
        }
      }
    }
  }
  const picked = pickBest([...byPosition.values()], true);
  if (!picked) {
    return { fields: [], warnings: [] };
  }
  const warnings: string[] = [];
  if (picked.ambiguous) {
    warnings.push(
      `Plusieurs dates de début trouvées (${joinFrench(picked.plausible.map((c) => frenchDate(c.value)))}) : vérifiez la date de début du prêt.`,
    );
  }
  return { fields: [fieldOf('startDate', picked)], warnings };
}

function frenchDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
