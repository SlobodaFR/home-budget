/** Champs du formulaire de crédit que l'import par OCR peut proposer (contrat de l'API, tranche 13). */
export const EXTRACTION_FIELDS = [
  'lender',
  'contractReference',
  'principalCents',
  'annualRatePercent',
  'initialTermMonths',
  'monthlyPaymentCents',
  'rateType',
  'insuranceMonthlyCents',
  'insuranceRatePercent',
  'insuranceMode',
  'feesCents',
  'guaranteeKind',
  'guaranteeCents',
  'startDate',
] as const;
export type ExtractionFieldName = (typeof EXTRACTION_FIELDS)[number];

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

/** Une valeur PROPOSÉE : l'utilisateur la valide dans le formulaire. */
export interface ExtractedField {
  field: ExtractionFieldName;
  value: string | number;
  confidence: Confidence;
  /** Extrait du texte lu qui justifie la valeur (≤ 140 caractères, espaces normalisés). */
  snippet: string;
  /** Numéro de page (≥ 1) ou null si inconnu. */
  page: number | null;
}

export interface ContractExtraction {
  fields: ExtractedField[];
  warnings: string[];
}

export const MAX_SNIPPET_LENGTH = 140;

const RANK: Record<Confidence, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

export function confidenceRank(confidence: Confidence): number {
  return RANK[confidence];
}

export function capConfidence(
  confidence: Confidence,
  max: Confidence,
): Confidence {
  return RANK[confidence] > RANK[max] ? max : confidence;
}

export function lowerConfidence(confidence: Confidence): Confidence {
  return confidence === 'HIGH'
    ? 'MEDIUM'
    : confidence === 'MEDIUM'
      ? 'LOW'
      : 'LOW';
}
