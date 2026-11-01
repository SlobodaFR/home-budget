import { MAX_DEBT_CENTS, insuranceRatePercentToHundredths } from '../debt/debt';
import { Line, makeSnippet } from './contract-text';
import {
  Confidence,
  ExtractedField,
  capConfidence,
  confidenceRank,
} from './extraction.types';
import { formatEuros, formatPercent } from './numbers';
import {
  Candidate,
  LabelHit,
  fieldOf,
  findLabels,
  joinFrench,
  makeCandidate,
  pickBest,
  stripNoInsuranceMentions,
  valueAfter,
  valuePosition,
} from './rules-common';
import { RuleResult } from './rules-rate';
import { AmountValue, PercentValue, scanAmount, scanPercent } from './scanners';

interface LabelSpec {
  pattern: RegExp;
  level: Confidence;
  /** Classe libre (ex. « NO_INSURANCE ») transmise au résultat. */
  tag?: string;
}

interface AmountOptions {
  /** Segment (libellé → valeur) qui disqualifie le candidat. */
  excludeSegment?: RegExp;
  /** Ligne entière qui disqualifie le candidat. */
  excludeLine?: RegExp;
  /** Montant minimal accepté (centimes) ; en dessous, écarté en silence. */
  minCents: number;
  /** Montant brut sans devise ni forme de montant : accepté à partir de ce seuil (centimes), sinon écarté. */
  bareFromCents?: number;
  /** Avertissement nommant la valeur hors limites. */
  label: string;
  /** Jeton à retenir après la valeur (période…) : appelé avec la ligne et la fin de la valeur. */
  accept?: (hit: { line: Line; end: number; segment: string }) => boolean;
}

interface TaggedCandidate extends Candidate<number> {
  tag?: string;
}

/** Candidats « libellé → montant », dédoublonnés par position de valeur (le meilleur niveau gagne). */
function amountCandidates(
  lines: readonly Line[],
  specs: readonly LabelSpec[],
  options: AmountOptions,
  warnings: string[],
): TaggedCandidate[] {
  const byPosition = new Map<string, TaggedCandidate>();
  for (const spec of specs) {
    for (const label of findLabels(lines, spec.pattern)) {
      if (options.excludeLine?.test(label.line.fold)) {
        continue;
      }
      const hit = valueAfter(lines, label, scanAmount);
      if (!hit) {
        continue;
      }
      const segment = stripNoInsuranceMentions(hit.segment);
      if (options.excludeSegment?.test(segment)) {
        continue;
      }
      if (
        options.accept &&
        !options.accept({ line: hit.line, end: hit.end, segment })
      ) {
        continue;
      }
      const amount: AmountValue = hit.value;
      let level = spec.level;
      if (!amount.currency && !amount.shaped) {
        if (
          options.bareFromCents === undefined ||
          amount.cents < options.bareFromCents
        ) {
          continue;
        }
        level = capConfidence(level, 'MEDIUM');
      } else if (!amount.currency) {
        level = capConfidence(level, 'MEDIUM');
      }
      if (amount.cents < options.minCents || amount.cents > MAX_DEBT_CENTS) {
        if (amount.cents > MAX_DEBT_CENTS) {
          warnings.push(
            `${options.label} lu (${formatEuros(amount.cents)}) est hors limites : il n'a pas été proposé.`,
          );
        }
        continue;
      }
      const candidate: TaggedCandidate = {
        ...makeCandidate(
          { ...hit, value: amount.cents },
          String(amount.cents),
          level,
        ),
        tag: spec.tag,
      };
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
  return [...byPosition.values()];
}

// ---------------------------------------------------------------------------
// Capital emprunté

const PRINCIPAL_LABELS: LabelSpec[] = [
  {
    pattern:
      /montant\s+(?:total\s+)?(?:du|de\s+ce|de\s+votre|de\s+l')\s*(?:credit|pret|emprunt|financement)/,
    level: 'HIGH',
  },
  {
    pattern:
      /montant\s+(?:total\s+)?(?:emprunte|finance|accorde|du\s+capital|principal)/,
    level: 'HIGH',
  },
  {
    pattern:
      /capital\s+(?:emprunte|du\s+pret|du\s+credit|initial|prete|finance)/,
    level: 'HIGH',
  },
  { pattern: /somme\s+(?:empruntee|pretee)/, level: 'HIGH' },
  {
    pattern:
      /(?:pret|credit|emprunt|financement)\s+(?:d'un\s+montant\s+(?:total\s+|maximum\s+)?de|de)\b/,
    level: 'MEDIUM',
  },
  { pattern: /\bcapital\s*[:=]/, level: 'MEDIUM' },
];

const NOT_PRINCIPAL_SEGMENT =
  /restant|echeance|mensualit|assurance|frais|cout|interets|differe|garantie|remboursement|taux|duree|apport|prix|bien|acquisition|travaux/;

export function extractPrincipal(lines: readonly Line[]): RuleResult {
  const warnings: string[] = [];
  const candidates = amountCandidates(
    lines,
    PRINCIPAL_LABELS,
    {
      excludeSegment: NOT_PRINCIPAL_SEGMENT,
      minCents: 1,
      bareFromCents: 100_000,
      label: 'Le montant du crédit',
    },
    warnings,
  );
  const picked = pickBest(candidates);
  if (!picked) {
    return { fields: [], warnings };
  }
  if (picked.ambiguous) {
    warnings.push(
      `Plusieurs montants de crédit trouvés (${joinFrench(picked.plausible.map((c) => formatEuros(c.value)))}) : vérifiez lequel est le capital emprunté.`,
    );
  }
  return { fields: [fieldOf('principalCents', picked)], warnings };
}

// ---------------------------------------------------------------------------
// Assurance emprunteur (montant mensuel, taux et base de calcul)

const MONTHLY_WORD = /mois|mensuel|\/\s?m\b/;
const NOT_MONTHLY_WORD =
  /\ban\b|annuel|annee|trimestr|semestr|total|\bcapital\b/;
const NOT_INSURANCE_AMOUNT_SEGMENT =
  /taux|total|capital|quotite|taeg|taea|couvert|garantie\s+d|plafond|franchise|limite|comprise|incluse|incluant|y\s+compris|hors\s+assurance|frais|prime\s+unique/;

export function extractInsuranceMonthly(lines: readonly Line[]): RuleResult {
  const warnings: string[] = [];
  const candidates = amountCandidates(
    lines,
    [
      {
        pattern:
          /(?:cotisation|prime|cout|montant|echeance)s?\s+(?:mensuelle\s+)?(?:de\s+l'|d')\s?assurance|assurance\s+(?:emprunteur|deces|invalidite|facultative|groupe|obligatoire)|\bassurance\b/,
        level: 'HIGH',
      },
    ],
    {
      excludeSegment: NOT_INSURANCE_AMOUNT_SEGMENT,
      minCents: 0,
      label: "L'assurance mensuelle",
      accept: ({ line, end, segment }) => {
        const window = `${segment} ${line.fold.slice(end, end + 30)}`;
        return MONTHLY_WORD.test(window) && !NOT_MONTHLY_WORD.test(window);
      },
    },
    warnings,
  ).filter((candidate) => candidate.value > 0);
  // « Échéance avec assurance : … » n'est pas le coût de l'assurance.
  const retained = candidates.filter((candidate) => {
    const line = lines[candidate.order];
    return (
      !line ||
      !/(?:mensualite|echeance|remboursement)s?[^:;\d]{0,50}\bassurance/.test(
        line.fold.slice(0, line.fold.indexOf('assurance') + 9),
      )
    );
  });
  const picked = pickBest(retained);
  if (!picked) {
    return { fields: [], warnings };
  }
  if (picked.ambiguous) {
    warnings.push(
      `Plusieurs montants d'assurance mensuelle trouvés (${joinFrench(picked.plausible.map((c) => formatEuros(c.value)))}) : vérifiez celui de l'assurance emprunteur.`,
    );
  }
  return { fields: [fieldOf('insuranceMonthlyCents', picked)], warnings };
}

const INSURANCE_RATE_LABELS: LabelSpec[] = [
  {
    pattern:
      /taux\s+(?:annuel\s+)?(?:effectif\s+)?(?:de\s+l'|d'|de\s+la\s+|de\s+)?(?:cotisation\s+(?:d')?)?assurance|\btaea\b|taux\s+de\s+(?:la\s+)?cotisation/,
    level: 'HIGH',
  },
  { pattern: /\bassurance\b/, level: 'MEDIUM' },
];

const NOT_INSURANCE_RATE_SEGMENT =
  /quotite|taeg|taux\s+debiteur|taux\s+nominal|interet|hors\s+assurance|effectif\s+global|\bteg\b|garantie\s+d|couvre|hauteur|deces\s+a|\bgaranti\b/;

const BASE_REMAINING =
  /capital\s+restant|restant\s+du|\bcrd\b|capital\s+amorti|encours/;
const BASE_INITIAL =
  /capital\s+(?:initial|emprunte|de\s+depart|initialement|assure\s+initial|du\s+(?:pret|credit))|(?:sur|du|de)\s+(?:le\s+)?montant\s+(?:initial|emprunte|du\s+(?:pret|credit))|cotisation\s+constante/;

type InsuranceMode = 'PERCENT_INITIAL' | 'PERCENT_REMAINING';

function baseIn(text: string): InsuranceMode | 'BOTH' | null {
  const remaining = BASE_REMAINING.test(text);
  const initial = BASE_INITIAL.test(text);
  if (remaining && initial) {
    return 'BOTH';
  }
  return remaining ? 'PERCENT_REMAINING' : initial ? 'PERCENT_INITIAL' : null;
}

function isValidInsuranceRate(hundredths: number): boolean {
  try {
    return insuranceRatePercentToHundredths(hundredths / 100) === hundredths;
  } catch {
    return false;
  }
}

export function extractInsuranceRate(lines: readonly Line[]): RuleResult {
  const warnings: string[] = [];
  const byPosition = new Map<
    string,
    Candidate<number> & { lineIndex: number }
  >();
  for (const spec of INSURANCE_RATE_LABELS) {
    for (const label of findLabels(lines, spec.pattern)) {
      if (
        /taeg|effectif global|\bteg\b/.test(label.line.fold) &&
        spec.level !== 'HIGH'
      ) {
        continue;
      }
      const hit = valueAfter(lines, label, scanPercent);
      if (!hit) {
        continue;
      }
      if (NOT_INSURANCE_RATE_SEGMENT.test(hit.segment)) {
        continue;
      }
      const percent: PercentValue = hit.value;
      if (percent.hundredths === null) {
        if (spec.level === 'HIGH') {
          warnings.push(
            `Le taux d'assurance lu (${percent.raw} %) a plus de 2 décimales : il n'a pas été proposé.`,
          );
        }
        continue;
      }
      if (!isValidInsuranceRate(percent.hundredths)) {
        if (spec.level === 'HIGH') {
          warnings.push(
            `Le taux d'assurance lu (${percent.raw} %) est hors limites (0 à 20 %) : il n'a pas été proposé.`,
          );
        }
        continue;
      }
      const candidate = {
        ...makeCandidate(
          { ...hit, value: percent.hundredths },
          String(percent.hundredths),
          spec.level,
        ),
        lineIndex: hit.label.lineIndex,
      };
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
  const picked = pickBest([...byPosition.values()]);
  if (!picked) {
    return { fields: [], warnings };
  }
  if (picked.ambiguous) {
    warnings.push(
      `Plusieurs taux d'assurance trouvés (${joinFrench(picked.plausible.map((c) => formatPercent(c.value)))}) : vérifiez celui de l'assurance emprunteur.`,
    );
  }
  const rateField = fieldOf('insuranceRatePercent', {
    ...picked,
    best: { ...picked.best, value: picked.best.value / 100 },
  });
  const fields: ExtractedField[] = [rateField];

  const bestLine = (picked.best as Candidate<number> & { lineIndex: number })
    .lineIndex;
  const base = locateBase(lines, bestLine, picked.best.page);
  if (base === 'BOTH') {
    warnings.push(
      "Le document cite à la fois le capital initial et le capital restant dû près de l'assurance : choisissez le mode de calcul de l'assurance.",
    );
  } else if (base) {
    const confidence =
      base.distance === 0
        ? rateField.confidence
        : base.distance <= 2
          ? capConfidence(rateField.confidence, 'MEDIUM')
          : 'LOW';
    fields.push({
      field: 'insuranceMode',
      value: base.mode,
      confidence,
      snippet: base.snippet,
      page: base.page,
    });
  } else {
    warnings.push(
      `Taux d'assurance lu (${formatPercent(picked.best.value)}) mais base de calcul illisible (capital initial ou capital restant dû) : choisissez le mode de calcul dans le formulaire.`,
    );
  }
  return { fields, warnings };
}

interface BaseHit {
  mode: InsuranceMode;
  distance: number;
  snippet: string;
  page: number;
}

/** Base de calcul de l'assurance cherchée près de la ligne du taux, puis dans tout le document. */
function locateBase(
  lines: readonly Line[],
  rateLine: number,
  page: number,
): BaseHit | 'BOTH' | null {
  const around: { index: number; distance: number }[] = [];
  for (let d = 0; d <= 2; d++) {
    around.push({ index: rateLine + d, distance: d });
    if (d > 0) {
      around.push({ index: rateLine - d, distance: d });
    }
  }
  for (const { index, distance } of around) {
    const line = lines[index];
    if (!line || line.virtual || line.page !== page) {
      continue;
    }
    const found = baseIn(line.fold);
    if (found === 'BOTH') {
      return 'BOTH';
    }
    if (found) {
      const pattern =
        found === 'PERCENT_REMAINING' ? BASE_REMAINING : BASE_INITIAL;
      const match = pattern.exec(line.fold)!;
      return {
        mode: found,
        distance,
        page: line.page,
        snippet: makeSnippet({
          labelLine: line,
          labelStart: Math.max(0, match.index - 40),
          valueLine: line,
          valueStart: match.index,
          valueEnd: match.index + match[0].length,
        }),
      };
    }
  }
  // Dans tout le document, seulement si une seule base est citée près du mot « assurance ».
  const hits = new Map<InsuranceMode, BaseHit>();
  lines.forEach((line) => {
    if (line.virtual || !/assurance/.test(line.fold)) {
      return;
    }
    const found = baseIn(line.fold);
    if (found && found !== 'BOTH' && !hits.has(found)) {
      const pattern =
        found === 'PERCENT_REMAINING' ? BASE_REMAINING : BASE_INITIAL;
      const match = pattern.exec(line.fold)!;
      hits.set(found, {
        mode: found,
        distance: 99,
        page: line.page,
        snippet: makeSnippet({
          labelLine: line,
          labelStart: Math.max(0, match.index - 40),
          valueLine: line,
          valueStart: match.index,
          valueEnd: match.index + match[0].length,
        }),
      });
    }
  });
  return hits.size === 1
    ? [...hits.values()][0]
    : hits.size > 1
      ? 'BOTH'
      : null;
}

// ---------------------------------------------------------------------------
// Mensualité hors assurance

const PAYMENT_WORD = '(?:mensualite|echeance|remboursement\\s+mensuel)s?';
const NO_INSURANCE_PAYMENT = new RegExp(
  `${PAYMENT_WORD}[^:\\d]{0,45}?\\b(?:hors|sans)\\s+(?:cotisations?\\s+(?:d'|de\\s+l')?)?(?:assurances?|accessoires|frais)`,
);
const CAPITAL_INTEREST_PAYMENT = new RegExp(
  `${PAYMENT_WORD}[^:\\d]{0,40}?\\(?\\s?(?:capital\\s*(?:\\+|et)\\s*interets?|amortissement\\s+hors)`,
);
const WITH_INSURANCE_PAYMENT = new RegExp(
  `${PAYMENT_WORD}[^:\\d]{0,45}?(?:\\bavec\\s+(?:l')?assurances?|assurances?\\s+(?:comprises?|incluses?)|y\\s+compris\\s+(?:l')?assurances?|incluant\\s+(?:l')?assurances?|\\bttc\\b|assurances?\\s+et\\s+accessoires)|${PAYMENT_WORD}\\s+(?:totale|globale)`,
);
const PLAIN_PAYMENT = new RegExp(
  `${PAYMENT_WORD}(?:\\s+(?:mensuelle|de\\s+remboursement|du\\s+(?:pret|credit)|d'amortissement|periodique))?`,
);
const NOT_PAYMENT_SEGMENT =
  /maxim|minim|plafond|capacite|simulation|prelev|differe|\bdont\b|n°|\bno\b|numero|date|premiere|derniere|periodicite|jour|taux\s+d'effort|nombre|duree|restant/;

export interface PaymentInput {
  insuranceMonthlyCents: number | null;
}

export function extractMonthlyPayment(
  lines: readonly Line[],
  input: PaymentInput,
): RuleResult {
  const warnings: string[] = [];
  const common = {
    excludeSegment: NOT_PAYMENT_SEGMENT,
    minCents: 1,
    label: 'La mensualité',
  };
  const without = amountCandidates(
    lines,
    [
      { pattern: NO_INSURANCE_PAYMENT, level: 'HIGH' },
      { pattern: CAPITAL_INTEREST_PAYMENT, level: 'HIGH' },
    ],
    common,
    warnings,
  );
  const withInsurance = amountCandidates(
    lines,
    [{ pattern: WITH_INSURANCE_PAYMENT, level: 'HIGH' }],
    { ...common, excludeSegment: NOT_PAYMENT_SEGMENT },
    warnings,
  );
  const plain = amountCandidates(
    lines,
    [{ pattern: PLAIN_PAYMENT, level: 'MEDIUM' }],
    common,
    warnings,
  );

  // Une même valeur ne compte que pour sa catégorie la plus précise.
  const claimed = new Set(
    [...without, ...withInsurance].map(
      (c) => `${c.page}:${c.order}:${c.value}`,
    ),
  );
  const plainOnly = plain.filter(
    (c) => !claimed.has(`${c.page}:${c.order}:${c.value}`),
  );

  const insurance = input.insuranceMonthlyCents;
  const withPicked = pickBest(withInsurance, true);
  let mainCandidates = [...without, ...plainOnly];
  if (withPicked && insurance && insurance > 0) {
    // Un libellé simple dont la valeur est celle « assurance comprise » ne dit rien de fiable.
    mainCandidates = mainCandidates.filter(
      (c) =>
        !(
          c.tag === undefined &&
          c.value === withPicked.best.value &&
          c.level !== 'HIGH'
        ),
    );
  }
  const picked = pickBest(mainCandidates, true);

  if (picked) {
    if (picked.ambiguous) {
      warnings.push(
        `Plusieurs mensualités trouvées (${joinFrench(picked.plausible.map((c) => formatEuros(c.value)))}) : vérifiez laquelle est hors assurance.`,
      );
    }
    let confidence = picked.confidence;
    if (
      withPicked &&
      insurance &&
      picked.best.level !== 'HIGH' &&
      !picked.best.corrected &&
      !picked.ambiguous &&
      Math.abs(picked.best.value + insurance - withPicked.best.value) <= 2
    ) {
      // Mensualité + assurance = mensualité « assurance comprise » : lecture recoupée.
      confidence = 'HIGH';
    }
    return {
      fields: [fieldOf('monthlyPaymentCents', picked, confidence)],
      warnings,
    };
  }

  if (withPicked) {
    const total = withPicked.best.value;
    if (insurance && insurance > 0 && total > insurance) {
      warnings.push(
        `Seule la mensualité assurance comprise (${formatEuros(total)}) est lisible : la mensualité hors assurance a été déduite en retirant l'assurance mensuelle (${formatEuros(insurance)}).`,
      );
      return {
        fields: [
          {
            field: 'monthlyPaymentCents',
            value: total - insurance,
            confidence: 'LOW',
            snippet: withPicked.best.snippet,
            page: withPicked.best.page,
          },
        ],
        warnings,
      };
    }
    warnings.push(
      `Seule la mensualité assurance comprise (${formatEuros(total)}) est lisible : le formulaire attend la mensualité hors assurance, retirez-en l'assurance mensuelle.`,
    );
  }
  return { fields: [], warnings };
}

// ---------------------------------------------------------------------------
// Frais de dossier

const FEES_LABELS: LabelSpec[] = [
  { pattern: /frais\s+de\s+dossier/, level: 'HIGH' },
  {
    pattern:
      /frais\s+d'(?:ouverture|etude|instruction|montage)(?:\s+(?:de|du))?(?:\s+(?:dossier|pret|credit))?|frais\s+de\s+(?:constitution|gestion|traitement|mise\s+en\s+place)(?:\s+(?:de|du))?(?:\s+(?:dossier|pret|credit))?|commission\s+(?:de\s+dossier|d'ouverture)/,
    level: 'MEDIUM',
  },
];
const NOT_FEES_SEGMENT =
  /max|plafonn|jusqu'a|au\s+plus|minimum|garantie|hypotheque|caution/;
const NO_FEES_WORD =
  /^[\s:=\-(]*(?:neant|gratuit|offerts?|aucun|sans\s+frais|exoneres?)/;

export function extractFees(lines: readonly Line[]): RuleResult {
  const warnings: string[] = [];
  const candidates = amountCandidates(
    lines,
    FEES_LABELS,
    {
      excludeSegment: NOT_FEES_SEGMENT,
      minCents: 0,
      label: 'Les frais de dossier',
    },
    warnings,
  );
  if (candidates.length === 0) {
    // « Frais de dossier : néant / offerts » → 0 €.
    for (const spec of FEES_LABELS) {
      for (const label of findLabels(lines, spec.pattern)) {
        const after = label.line.fold.slice(label.end, label.end + 30);
        const word = NO_FEES_WORD.exec(after);
        if (!word) {
          continue;
        }
        const junk = word[0].length - word[0].replace(/^[\s:=\-(]*/, '').length;
        const valueStart = label.end + junk;
        const valueEnd = label.end + word[0].length;
        candidates.push({
          value: 0,
          key: '0',
          level: 'MEDIUM',
          corrected: false,
          snippet: makeSnippet({
            labelLine: label.line,
            labelStart: label.start,
            valueLine: label.line,
            valueStart,
            valueEnd,
          }),
          page: label.line.page,
          order: label.lineIndex,
        });
      }
    }
  }
  const picked = pickBest(candidates);
  if (!picked) {
    return { fields: [], warnings };
  }
  if (picked.ambiguous) {
    warnings.push(
      `Plusieurs montants de frais de dossier trouvés (${joinFrench(picked.plausible.map((c) => formatEuros(c.value)))}) : vérifiez-les.`,
    );
  }
  return { fields: [fieldOf('feesCents', picked)], warnings };
}

// ---------------------------------------------------------------------------
// Garantie

type GuaranteeKind = 'SURETY' | 'MORTGAGE' | 'OTHER';

const GUARANTEE_KEYWORDS: { kind: GuaranteeKind; pattern: RegExp }[] = [
  {
    kind: 'SURETY',
    pattern:
      /cautionnement|\bcaution\b|credit\s+logement|\bcamca\b|\bsaccef\b|societe\s+de\s+caution|organisme\s+de\s+caution/,
  },
  {
    kind: 'MORTGAGE',
    pattern:
      /hypotheque|hypothecaire|privilege\s+de\s+preteur\s+de\s+deniers|\bppd\b/,
  },
  {
    kind: 'OTHER',
    pattern:
      /nantissement|\bgage\b|delegation\s+de\s+(?:salaire|creance|loyers)/,
  },
];
const GUARANTEE_CONTEXT = /garantie|surete|garanti\s+par|garantis?\s+par/;
const NO_GUARANTEE =
  /sans\s+(?:caution|garantie|hypotheque)|aucune\s+(?:caution|garantie|hypotheque)|pas\s+de\s+(?:caution|garantie|hypotheque)|dispense\s+de|\bni\s+(?:caution|hypotheque)|garantie\s*:?\s*(?:neant|aucune)|non\s+garanti|en\s+cas\s+de\s+(?:defaillance|defaut|non[- ]paiement)/;

const GUARANTEE_COST_LABELS: { pattern: RegExp; kind: GuaranteeKind | null }[] =
  [
    {
      pattern:
        /frais\s+de\s+(?:caution(?:nement)?)|commission\s+de\s+caution|cout\s+de\s+la\s+caution|contribution\s+(?:au\s+)?fonds\s+(?:mutuel\s+)?de\s+garantie/,
      kind: 'SURETY',
    },
    {
      pattern:
        /frais\s+(?:d'hypotheque|de\s+(?:privilege|ppd)|d'inscription\s+(?:hypothecaire|de\s+privilege))/,
      kind: 'MORTGAGE',
    },
    {
      pattern:
        /frais\s+de\s+garantie|cout\s+de\s+la\s+garantie|commission\s+de\s+garantie/,
      kind: null,
    },
  ];

export function extractGuarantee(lines: readonly Line[]): RuleResult {
  const warnings: string[] = [];
  const fields: ExtractedField[] = [];

  const kinds: Candidate<string>[] = [];
  lines.forEach((line, lineIndex) => {
    if (line.virtual || NO_GUARANTEE.test(line.fold)) {
      return;
    }
    const previous = lines[lineIndex - 1];
    for (const { kind, pattern } of GUARANTEE_KEYWORDS) {
      const match = pattern.exec(line.fold);
      if (!match) {
        continue;
      }
      const before = line.fold.slice(0, match.index);
      const labelled =
        GUARANTEE_CONTEXT.test(before) ||
        (before.trim().length < 3 &&
          previous !== undefined &&
          !previous.virtual &&
          /garantie\s*:?\s*$|garanties?\s+(?:du|de)\s+(?:pret|credit)\s*:?\s*$/.test(
            previous.fold,
          ));
      // Frais de garantie : le mot-clé est le libellé d'un coût, pas la nature de la garantie.
      if (/^\s*\d|frais|cout|commission|contribution/.test(before.slice(-12))) {
        continue;
      }
      kinds.push({
        value: kind,
        key: kind,
        level: labelled ? 'HIGH' : 'MEDIUM',
        corrected: false,
        snippet: makeSnippet({
          labelLine: line,
          labelStart: Math.max(0, match.index - 30),
          valueLine: line,
          valueStart: match.index,
          valueEnd: Math.min(
            line.text.length,
            match.index + match[0].length + 40,
          ),
        }),
        page: line.page,
        order: lineIndex,
      });
    }
  });
  const kindPicked = pickBest(kinds, true);
  if (kindPicked) {
    if (kindPicked.ambiguous) {
      warnings.push(
        `Plusieurs types de garantie sont cités (${joinFrench(kindPicked.plausible.map((c) => guaranteeLabel(c.value as GuaranteeKind)))}) : vérifiez celui de ce prêt.`,
      );
    }
    fields.push(fieldOf('guaranteeKind', kindPicked));
  }

  const costs = amountCandidates(
    lines,
    GUARANTEE_COST_LABELS.map((entry, index) => ({
      pattern: entry.pattern,
      level: 'HIGH',
      tag: String(index),
    })),
    {
      excludeSegment: /max|plafonn|rembours|restitu/,
      minCents: 0,
      label: 'Les frais de garantie',
    },
    warnings,
  );
  const costPicked = pickBest(costs);
  if (costPicked) {
    if (costPicked.ambiguous) {
      warnings.push(
        `Plusieurs montants de frais de garantie trouvés (${joinFrench(costPicked.plausible.map((c) => formatEuros(c.value)))}) : vérifiez-les.`,
      );
    }
    fields.push(fieldOf('guaranteeCents', costPicked));
    if (!kindPicked && costPicked.best.value > 0) {
      const tag = (costPicked.best as TaggedCandidate).tag;
      const kind =
        tag === undefined ? null : GUARANTEE_COST_LABELS[Number(tag)].kind;
      if (kind) {
        fields.push({
          field: 'guaranteeKind',
          value: kind,
          confidence: 'MEDIUM',
          snippet: costPicked.best.snippet,
          page: costPicked.best.page,
        });
      } else {
        warnings.push(
          'Des frais de garantie ont été lus mais pas le type de garantie : précisez-le dans le formulaire (caution, hypothèque ou autre).',
        );
      }
    }
  }
  return { fields, warnings };
}

function guaranteeLabel(kind: GuaranteeKind): string {
  return kind === 'SURETY'
    ? 'caution'
    : kind === 'MORTGAGE'
      ? 'hypothèque ou privilège de prêteur de deniers'
      : 'autre garantie';
}

export type { LabelHit };
