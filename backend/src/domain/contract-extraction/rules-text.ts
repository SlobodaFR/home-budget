import {
  MAX_DEBT_LENDER_LENGTH,
  MAX_DEBT_REFERENCE_LENGTH,
} from '../debt/debt';
import { Line, makeSnippet } from './contract-text';
import { Confidence, ExtractedField } from './extraction.types';
import {
  Candidate,
  Scanner,
  fieldOf,
  findLabels,
  joinFrench,
  pickBest,
  snippetOf,
  valueAfter,
  valuePosition,
} from './rules-common';
import { RuleResult } from './rules-rate';

// ---------------------------------------------------------------------------
// Prêteur

const LEGAL_SUFFIX =
  /\s+(?:S\.?\s?A\.?\s?S?\.?\s?U?\.?|S\.?C\.?A\.?|S\.?N\.?C\.?|S\.?A\.?R\.?L\.?|soci[ée]t[ée]\s+anonyme|soci[ée]t[ée]\s+coop[ée]rative.*|SA\s+coop[ée]rative.*)\s*$/i;
const CUT_NAME =
  /\s{2,}| - |;|\(|,|\s(?:au\s+capital|RCS|immatricul|dont\s+le\s+si[eè]ge|si[eè]ge|agr[ée]|ci-apr[eè]s|repr[ée]sent|SIREN|SIRET|ORIAS|TVA|n°|enregistr|inscrit)\b|\s\d{5}\b/i;
const NOT_A_NAME =
  /\b(?:est|sont|dont|que|qui|ci-apr[eè]s|d[ée]sign[ée]|d[ée]nomm[ée]|emprunteur|mentionn[ée]|ci-dessous|ci-dessus|adresse|si[eè]ge|courrier|suivant|nomm[ée]|ainsi|voir|notice|contrat|offre|conditions|signature|d[ée]signation|nom|pr[êe]t|cr[ée]dit\s+immobilier)\b/i;
const GENERIC_NAMES = new Set([
  'le preteur',
  'la banque',
  'preteur',
  'banque',
  'l etablissement',
  'etablissement',
  'organisme',
  'la societe',
  'societe',
]);

/** Nettoie et valide un nom d'établissement ; null si le résultat est douteux (on préfère ne rien proposer). */
export function cleanLenderName(raw: string): string | null {
  let name = raw.trim();
  const cut = CUT_NAME.exec(name);
  if (cut) {
    name = name.slice(0, cut.index);
  }
  name = name.replace(/^["«»'\s:.-]+|["«»'\s:.,;-]+$/g, '').trim();
  for (let i = 0; i < 3; i++) {
    const stripped = name.replace(LEGAL_SUFFIX, '').trim();
    if (stripped === name) {
      break;
    }
    name = stripped;
  }
  name = name.replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > Math.min(60, MAX_DEBT_LENDER_LENGTH)) {
    return null;
  }
  if (name.split(' ').length > 7) {
    return null;
  }
  if (NOT_A_NAME.test(name)) {
    return null;
  }
  if ((name.match(/\d/g) ?? []).length > 3) {
    return null;
  }
  const generic = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’]/g, ' ');
  if (GENERIC_NAMES.has(generic)) {
    return null;
  }
  if (!/^[\p{Lu}\d]/u.test(name)) {
    return null;
  }
  if (!/\p{Lu}/u.test(name.slice(1)) && name === name.toLowerCase()) {
    return null;
  }
  return name;
}

interface LenderLabel {
  pattern: RegExp;
  level: Confidence;
  /** Le libellé doit être suivi de « : » ou d'au moins 2 espaces. */
  separatorRequired: boolean;
}

const LENDER_LABELS: LenderLabel[] = [
  {
    pattern: /etablissement\s+(?:preteur|de\s+credit|financier|bancaire)/,
    level: 'HIGH',
    separatorRequired: false,
  },
  {
    pattern:
      /organisme\s+preteur|nom\s+du\s+preteur|(?:banque|societe)\s+preteuse/,
    level: 'HIGH',
    separatorRequired: false,
  },
  {
    pattern: /\ble\s+preteur|\bpreteur/,
    level: 'HIGH',
    separatorRequired: true,
  },
  { pattern: /\bbanque/, level: 'MEDIUM', separatorRequired: true },
];

const scanLenderName: Scanner<string> = (line, from, limit) => {
  const rest = line.text.slice(from, limit);
  const lead = /^\s*(?::|=)?\s*/.exec(rest);
  const offset = lead ? lead[0].length : 0;
  const name = cleanLenderName(rest.slice(offset));
  if (!name) {
    return null;
  }
  const start = from + offset;
  const found = line.text.indexOf(name.split(' ')[0], start);
  if (found < 0 || found > start + 3) {
    return null;
  }
  return {
    value: name,
    corrected: false,
    start: found,
    end: found + name.length,
  };
};

function nearAccountInfo(lines: readonly Line[], index: number): boolean {
  for (let d = -2; d <= 2; d++) {
    const line = lines[index + d];
    if (
      line &&
      /\biban\b|\brib\b|\bbic\b|domicili|compte\s+(?:bancaire|a\s+debiter|courant)|prelevement/.test(
        line.fold,
      )
    ) {
      return true;
    }
  }
  return false;
}

interface KnownBank {
  name: string;
  pattern: RegExp;
}

const KNOWN_BANKS: KnownBank[] = [
  { name: 'Crédit Agricole', pattern: /credit\s+agricole/ },
  { name: "Caisse d'Epargne", pattern: /caisses?\s+d'\s?epargne/ },
  { name: 'Banque Populaire', pattern: /banque\s+populaire/ },
  { name: 'BNP Paribas', pattern: /\bbnp\s+paribas|\bbnp\b/ },
  { name: 'Société Générale', pattern: /societe\s+generale/ },
  { name: 'LCL', pattern: /\blcl\b|credit\s+lyonnais/ },
  { name: 'Crédit Mutuel', pattern: /credit\s+mutuel/ },
  { name: 'CIC', pattern: /\bcic\b/ },
  { name: 'La Banque Postale', pattern: /banque\s+postale/ },
  { name: 'Crédit du Nord', pattern: /credit\s+du\s+nord/ },
  { name: 'HSBC', pattern: /\bhsbc\b/ },
  { name: 'Boursorama Banque', pattern: /boursorama/ },
  { name: 'Crédit Foncier', pattern: /credit\s+foncier/ },
  { name: 'Crédit Coopératif', pattern: /credit\s+cooperatif/ },
  { name: 'Banque Palatine', pattern: /banque\s+palatine/ },
  { name: 'Arkéa', pattern: /\barkea\b/ },
  { name: 'Cetelem', pattern: /\bcetelem\b/ },
  { name: 'Cofidis', pattern: /\bcofidis\b/ },
  { name: 'Sofinco', pattern: /\bsofinco\b/ },
  { name: 'Franfinance', pattern: /\bfranfinance\b/ },
  { name: 'Floa', pattern: /\bfloa\b/ },
  { name: 'Younited', pattern: /\byounited\b/ },
  { name: 'Hello bank!', pattern: /hello\s+bank/ },
  { name: 'Fortuneo', pattern: /\bfortuneo\b/ },
  { name: 'Monabanq', pattern: /\bmonabanq\b/ },
  { name: 'BforBank', pattern: /\bbforbank\b/ },
  { name: 'Axa Banque', pattern: /axa\s+banque/ },
  { name: 'Carrefour Banque', pattern: /carrefour\s+banque/ },
  { name: 'RCI Banque', pattern: /\brci\s+banque/ },
  { name: 'Oney', pattern: /\boney\b/ },
  { name: 'Domofinance', pattern: /\bdomofinance\b/ },
  { name: 'CGI Finance', pattern: /\bcgi\s+finance\b/ },
  { name: 'Action Logement', pattern: /action\s+logement/ },
];

const INSURER_LINE = /assur|cnp|cardif|predica|garantie\s+d|courtier/;

export function extractLender(lines: readonly Line[]): RuleResult {
  const warnings: string[] = [];
  const byPosition = new Map<string, Candidate<string>>();
  const add = (candidate: Candidate<string>, position: string) => {
    if (!byPosition.has(position)) {
      byPosition.set(position, candidate);
    }
  };

  // 1. Libellés explicites.
  for (const spec of LENDER_LABELS) {
    for (const label of findLabels(lines, spec.pattern)) {
      if (label.line.virtual && spec.separatorRequired) {
        continue;
      }
      const after = label.line.text.slice(label.end);
      const separated = /^\s*[:=]|^\s{2,}\S/.test(after);
      if (spec.separatorRequired && !separated) {
        continue;
      }
      if (
        !spec.separatorRequired &&
        !/^\s*(?:[:=]|\s)\s*\S|^\s*$/.test(after)
      ) {
        continue;
      }
      if (spec.level === 'MEDIUM' && nearAccountInfo(lines, label.lineIndex)) {
        continue;
      }
      const hit = valueAfter(lines, label, scanLenderName);
      if (!hit) {
        continue;
      }
      if (hit.viaNextLine && hit.line.text.length > 70) {
        continue;
      }
      add(
        {
          value: hit.value,
          key: hit.value.toLowerCase(),
          level: spec.level,
          corrected: false,
          snippet: snippetOf(hit),
          page: hit.line.page,
          order: hit.label.lineIndex,
        },
        valuePosition(hit),
      );
    }
  }

  // 2. « La société X, …, ci-après le Prêteur ».
  for (const candidate of lenderFromDefinition(lines)) {
    add(candidate, `def:${candidate.page}:${candidate.order}`);
  }

  let picked = pickBest([...byPosition.values()]);
  if (!picked) {
    // 3. Nom d'établissement connu cité dans le document.
    const known = knownBankCandidates(lines);
    picked = pickBest(known);
    if (picked?.ambiguous) {
      warnings.push(
        `Plusieurs établissements sont cités (${joinFrench(picked.plausible.map((c) => c.value))}) : vérifiez le prêteur.`,
      );
    }
    if (picked) {
      return {
        fields: [
          fieldOf('lender', picked, picked.ambiguous ? 'LOW' : 'MEDIUM'),
        ],
        warnings,
      };
    }
    return { fields: [], warnings };
  }
  if (picked.ambiguous) {
    warnings.push(
      `Plusieurs prêteurs possibles (${joinFrench(picked.plausible.map((c) => c.value))}) : vérifiez le nom de l'établissement prêteur.`,
    );
  }
  return { fields: [fieldOf('lender', picked)], warnings };
}

function lenderFromDefinition(lines: readonly Line[]): Candidate<string>[] {
  const found: Candidate<string>[] = [];
  const real = lines.filter((line) => !line.virtual);
  real.forEach((line, index) => {
    const match =
      /ci-apres[^.]{0,30}?(?:le\s+|la\s+|l'\s?)?(?:preteur|banque|etablissement\s+preteur|etablissement\s+de\s+credit)/.exec(
        line.fold,
      );
    if (!match) {
      return;
    }
    // Début de la phrase : on remonte (3 lignes au plus) jusqu'à une ligne qui suit un « : » ou un « . ».
    let startIndex = index;
    for (let back = 0; back <= 3; back++) {
      const candidate = real[index - back];
      const before = real[index - back - 1];
      if (!candidate || candidate.page !== line.page) {
        break;
      }
      startIndex = index - back;
      if (
        !before ||
        before.page !== line.page ||
        /[:.;]\s*$/.test(before.text)
      ) {
        break;
      }
    }
    const first = real[startIndex];
    let windowText = '';
    for (let i = startIndex; i < index; i++) {
      windowText += `${real[i].text} `;
    }
    windowText += line.text.slice(0, match.index);
    // Le nom est le premier segment de la phrase, avant la première virgule.
    const firstChunk = windowText.split(',')[0];
    const prefixed =
      /(?:la\s+soci[ée]t[ée]|la\s+banque|l'\s?[ée]tablissement(?:\s+de\s+cr[ée]dit)?|la\s+caisse(?:\s+r[ée]gionale)?|soci[ée]t[ée])\s+([^,;:()]{3,70})/i.exec(
        firstChunk,
      );
    const name = cleanLenderName(prefixed ? prefixed[1] : firstChunk);
    if (!name) {
      return;
    }
    const nameStart = Math.max(0, first.text.indexOf(name));
    found.push({
      value: name,
      key: name.toLowerCase(),
      level: 'MEDIUM',
      corrected: false,
      snippet: makeSnippet({
        labelLine: first,
        labelStart: nameStart,
        valueLine: first,
        valueStart: nameStart,
        valueEnd: nameStart + name.length,
      }),
      page: line.page,
      order: line.page * 10_000 + index,
    });
  });
  return found;
}

function knownBankCandidates(lines: readonly Line[]): Candidate<string>[] {
  const found: Candidate<string>[] = [];
  lines.forEach((line, lineIndex) => {
    if (line.virtual || INSURER_LINE.test(line.fold)) {
      return;
    }
    for (const bank of KNOWN_BANKS) {
      const match = bank.pattern.exec(line.fold);
      if (!match) {
        continue;
      }
      found.push({
        value: bank.name,
        key: bank.name,
        level: 'MEDIUM',
        corrected: false,
        snippet: makeSnippet({
          labelLine: line,
          labelStart: Math.max(0, match.index - 10),
          valueLine: line,
          valueStart: match.index,
          valueEnd: match.index + match[0].length,
        }),
        page: line.page,
        order: lineIndex,
      });
    }
  });
  return found;
}

// ---------------------------------------------------------------------------
// Référence du contrat

const REFERENCE_LABELS: { pattern: RegExp; level: Confidence }[] = [
  {
    pattern:
      /(?:reference|numero|n°|no\.?)\s+(?:du\s+|de\s+l[a']\s*|de\s+)?(?:contrat|pret|credit)\b/,
    level: 'HIGH',
  },
  { pattern: /(?:contrat|pret|credit)\s+(?:n°|no\b\.?|numero)/, level: 'HIGH' },
  { pattern: /identifiant\s+(?:du\s+)?(?:pret|contrat|credit)/, level: 'HIGH' },
  {
    pattern:
      /offre\s+de\s+(?:pret|credit)(?:\s+[a-z]+){0,2}\s+(?:n°|no\b\.?|numero)/,
    level: 'MEDIUM',
  },
  {
    pattern:
      /(?:reference|numero|n°|no\.?)\s+(?:de\s+l'\s?offre|d'\s?offre|du\s+dossier|de\s+dossier)|(?:offre|dossier)\s+(?:n°|no\b\.?|numero)/,
    level: 'MEDIUM',
  },
  { pattern: /\bref(?:erence)?\.?\s*:/, level: 'MEDIUM' },
];

const REFERENCE_TOKEN = /^[A-Z0-9][A-Z0-9\-/._]{3,59}/;
const DATE_LIKE = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/;

const scanReference: Scanner<string> = (line, from, limit) => {
  const slice = line.text.slice(from, limit);
  const prefix = /^\s*(?:(?:n°|no\.?|num[ée]ro)\s*)?[:=]?\s*/i.exec(slice);
  const offset = prefix ? prefix[0].length : 0;
  const token = REFERENCE_TOKEN.exec(slice.slice(offset));
  if (!token) {
    return null;
  }
  const value = token[0].replace(/[-/._]+$/, '');
  if (
    (value.match(/\d/g) ?? []).length < 3 ||
    value.length > MAX_DEBT_REFERENCE_LENGTH ||
    DATE_LIKE.test(value) ||
    /^[A-Z]{2}\d{2}[A-Z0-9]{10,}/.test(value)
  ) {
    return null;
  }
  const start = from + offset;
  return { value, corrected: false, start, end: start + value.length };
};

export function extractContractReference(lines: readonly Line[]): RuleResult {
  const byPosition = new Map<string, Candidate<string>>();
  for (const spec of REFERENCE_LABELS) {
    for (const label of findLabels(lines, spec.pattern)) {
      const hit = valueAfter(lines, label, scanReference);
      if (!hit) {
        continue;
      }
      const position = valuePosition(hit);
      const existing = byPosition.get(position);
      if (!existing || spec.level === 'HIGH') {
        byPosition.set(position, {
          value: hit.value,
          key: hit.value,
          level: spec.level,
          corrected: false,
          snippet: snippetOf(hit),
          page: hit.line.page,
          order: hit.label.lineIndex,
        });
      }
    }
  }
  const picked = pickBest([...byPosition.values()]);
  if (!picked) {
    return { fields: [], warnings: [] };
  }
  const warnings: string[] = [];
  if (picked.ambiguous) {
    warnings.push(
      `Plusieurs références trouvées (${joinFrench(picked.plausible.map((c) => c.value))}) : vérifiez la référence du contrat.`,
    );
  }
  return { fields: [fieldOf('contractReference', picked)], warnings };
}

export type { ExtractedField };
