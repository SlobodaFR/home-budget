import { expectedMonthlyPaymentCents } from '../debt/amortization';
import {
  assessTextQuality,
  buildLines,
  foldText,
  normalizeText,
} from './contract-text';
import {
  ContractExtraction,
  EXTRACTION_FIELDS,
  ExtractedField,
  lowerConfidence,
} from './extraction.types';
import { formatEuros } from './numbers';
import {
  extractFees,
  extractGuarantee,
  extractInsuranceMonthly,
  extractInsuranceRate,
  extractMonthlyPayment,
  extractPrincipal,
} from './rules-money';
import { extractAnnualRate, extractRateType, readTaeg } from './rules-rate';
import { extractStartDate, extractTerm } from './rules-term-date';
import { extractContractReference, extractLender } from './rules-text';

export const MAX_WARNINGS = 12;

/** Familles de mots qui trahissent une offre ou un contrat de prêt. */
const LOAN_SIGNALS: RegExp[] = [
  /\b(?:pret|credit|emprunt)/,
  /\btaux\b/,
  /\btaeg\b|taux\s+annuel\s+effectif|\bteg\b/,
  /mensualit|echeance/,
  /\bduree\b/,
  /preteur|emprunteur/,
  /\bcapital\b|\bmontant\b/,
  /\boffre\b/,
];
const MIN_LOAN_SIGNALS = 3;

/** Écart toléré entre la mensualité lue et celle qu'imposent capital, taux et durée. */
const PAYMENT_TOLERANCE = 0.03;

/**
 * Lit un contrat ou une offre de prêt français (texte d'un PDF ou sortie d'OCR, une
 * chaîne par page) et PROPOSE des valeurs pour le formulaire de crédit. Aucune IA :
 * règles de lecture déterministes. Un champ non trouvé est absent ; une valeur douteuse
 * est écartée plutôt que devinée.
 */
export function extractContractFields(
  pages: readonly string[],
): ContractExtraction {
  const warnings: string[] = [];
  const fullText = pages.map((page) => normalizeText(page)).join('\n');
  const quality = assessTextQuality(fullText);
  if (quality.tooShort) {
    return {
      fields: [],
      warnings: [
        'Très peu de texte lisible dans ce document : il est peut-être vide, protégé ou trop flou. Essayez avec un scan plus net.',
      ],
    };
  }
  if (quality.poor) {
    warnings.push(
      'Le texte lu est de mauvaise qualité (nombreux caractères ou mots illisibles) : vérifiez soigneusement chaque valeur ou utilisez un scan plus net.',
    );
  }

  const lines = buildLines(pages);
  const fields: ExtractedField[] = [];
  const collect = (result: {
    fields: ExtractedField[];
    warnings: string[];
  }) => {
    fields.push(...result.fields);
    warnings.push(...result.warnings);
  };

  const taeg = readTaeg(lines);
  const rate = extractAnnualRate(lines, taeg);
  const insuranceMonthly = extractInsuranceMonthly(lines);
  const insuranceMonthlyCents =
    (insuranceMonthly.fields[0]?.value as number | undefined) ?? null;

  collect(extractLender(lines));
  collect(extractContractReference(lines));
  collect(extractPrincipal(lines));
  collect(rate);
  collect(extractTerm(lines));
  collect(extractMonthlyPayment(lines, { insuranceMonthlyCents }));
  collect(extractRateType(lines));
  collect(insuranceMonthly);
  collect(extractInsuranceRate(lines));
  collect(extractFees(lines));
  collect(extractGuarantee(lines));
  collect(extractStartDate(lines));

  let ordered = EXTRACTION_FIELDS.flatMap((name) => {
    const found = fields.find((field) => field.field === name);
    return found ? [found] : [];
  });
  if (quality.poor) {
    ordered = ordered.map((field) => ({
      ...field,
      confidence: lowerConfidence(field.confidence),
    }));
  }

  warnings.push(...consistencyWarnings(ordered));

  const signals = LOAN_SIGNALS.filter((signal) =>
    signal.test(foldText(fullText)),
  ).length;
  if (signals < MIN_LOAN_SIGNALS) {
    warnings.push(
      'Ce document ne ressemble pas à une offre ou à un contrat de prêt : vérifiez que vous avez choisi le bon fichier.',
    );
  } else if (ordered.length === 0) {
    warnings.push(
      "Aucune valeur n'a pu être lue de façon fiable dans ce document : saisissez les informations à la main.",
    );
  }

  return { fields: ordered, warnings: unique(warnings).slice(0, MAX_WARNINGS) };
}

function unique(items: readonly string[]): string[] {
  return [...new Set(items)];
}

function valueOf<T extends string | number>(
  fields: readonly ExtractedField[],
  name: ExtractedField['field'],
): T | undefined {
  return fields.find((field) => field.field === name)?.value as T | undefined;
}

/** Recoupe capital, taux, durée et mensualité : un écart trahit en général un chiffre mal lu. */
function consistencyWarnings(fields: readonly ExtractedField[]): string[] {
  const principal = valueOf<number>(fields, 'principalCents');
  const rate = valueOf<number>(fields, 'annualRatePercent');
  const term = valueOf<number>(fields, 'initialTermMonths');
  const payment = valueOf<number>(fields, 'monthlyPaymentCents');
  const rateType = valueOf<string>(fields, 'rateType');
  if (
    principal === undefined ||
    rate === undefined ||
    term === undefined ||
    payment === undefined ||
    (rateType !== undefined && rateType !== 'FIXED')
  ) {
    return [];
  }
  try {
    const expected = expectedMonthlyPaymentCents(
      principal,
      Math.round(rate * 100),
      term,
    );
    if (Math.abs(expected - payment) / expected > PAYMENT_TOLERANCE) {
      return [
        `La mensualité lue (${formatEuros(payment)}) ne correspond pas au capital, au taux et à la durée lus (environ ${formatEuros(expected)} attendus) : vérifiez ces valeurs, un chiffre est peut-être mal lu.`,
      ];
    }
  } catch {
    return [];
  }
  return [];
}
