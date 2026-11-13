import {
  DebtFormValues,
  describeTerm,
  formatRate,
  GUARANTEE_KIND_LABEL,
  GUARANTEE_KINDS,
  GuaranteeKind,
  INSURANCE_MODE_LABEL,
  INSURANCE_MODES,
  InsuranceMode,
  MAX_CONTRACT_REFERENCE_LENGTH,
  MAX_INSURANCE_RATE_PERCENT,
  MAX_LENDER_LENGTH,
  MAX_RATE_PERCENT,
  MAX_TERM_MONTHS,
  MIN_TERM_MONTHS,
  percentToInput,
  RATE_TYPE_LABEL,
  RATE_TYPES,
  RateType,
  termToForm,
} from './debt';
import { centsToInputValue, formatCentsShort, MAX_AMOUNT_CENTS } from './money';
import { formatLongDateInput, isValidDateInput } from './month';

/**
 * Import d'un contrat de prêt par OCR (tranche 13). Tout ce fichier est pur : lecture tolérante de la réponse du serveur,
 * formats d'affichage, validation et application sélective des propositions dans le formulaire de crédit.
 * L'extraction ne fait que PROPOSER : rien n'est enregistré sans validation du formulaire.
 */

// ---------------------------------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------------------------------

export type ExtractionConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type ExtractionFieldKey =
  | 'lender'
  | 'contractReference'
  | 'principalCents'
  | 'annualRatePercent'
  | 'rateType'
  | 'monthlyPaymentCents'
  | 'initialTermMonths'
  | 'startDate'
  | 'insuranceMode'
  | 'insuranceMonthlyCents'
  | 'insuranceRatePercent'
  | 'feesCents'
  | 'guaranteeKind'
  | 'guaranteeCents';

/** Dans l'ordre d'affichage de l'écran de relecture. */
export const EXTRACTION_FIELD_ORDER: readonly ExtractionFieldKey[] = [
  'lender',
  'contractReference',
  'principalCents',
  'annualRatePercent',
  'rateType',
  'monthlyPaymentCents',
  'initialTermMonths',
  'startDate',
  'insuranceMode',
  'insuranceMonthlyCents',
  'insuranceRatePercent',
  'feesCents',
  'guaranteeKind',
  'guaranteeCents',
];

export const EXTRACTION_FIELD_LABEL: Record<ExtractionFieldKey, string> = {
  lender: 'Prêteur',
  contractReference: 'Référence du contrat',
  principalCents: 'Capital emprunté',
  annualRatePercent: 'Taux annuel',
  rateType: 'Type de taux',
  monthlyPaymentCents: 'Mensualité (hors assurance)',
  initialTermMonths: 'Durée initiale',
  startDate: 'Date de début',
  insuranceMode: 'Calcul de l’assurance',
  insuranceMonthlyCents: 'Assurance par mois',
  insuranceRatePercent: 'Taux de l’assurance',
  feesCents: 'Frais de dossier',
  guaranteeKind: 'Garantie',
  guaranteeCents: 'Frais de garantie',
};

const TEXT_FIELDS: readonly ExtractionFieldKey[] = ['lender', 'contractReference'];
const CENTS_FIELDS: readonly ExtractionFieldKey[] = ['principalCents', 'monthlyPaymentCents', 'insuranceMonthlyCents', 'feesCents', 'guaranteeCents'];
const PERCENT_FIELDS: readonly ExtractionFieldKey[] = ['annualRatePercent', 'insuranceRatePercent'];

export interface ExtractedField {
  field: ExtractionFieldKey;
  /** Texte pour les champs textuels, énumérations et dates ; nombre pour les montants (centimes), taux et durées. */
  value: string | number;
  confidence: ExtractionConfidence;
  /** Extrait du texte lu qui justifie la valeur (on n'en affiche jamais plus que ce que le serveur renvoie). */
  snippet: string | null;
  page: number | null;
}

export type ExtractionSource = 'TEXT_LAYER' | 'OCR';

export interface ExtractionResult {
  source: ExtractionSource | null;
  pages: number | null;
  engine: string | null;
  fields: ExtractedField[];
  warnings: string[];
}

export type ExtractionStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
export type ExtractionStage = 'TEXT' | 'OCR' | 'PARSING';

export interface ExtractionJob {
  status: ExtractionStatus;
  stage: ExtractionStage | null;
  /** Entier de 0 à 100. */
  progressPercent: number;
  result: ExtractionResult | null;
  errorMessage: string | null;
}

export interface ExtractionCapabilities {
  available: boolean;
  maxFileBytes: number;
  maxPages: number | null;
}

export interface ExtractionStart {
  jobId: string;
  /** Date d'expiration du résultat côté serveur, en millisecondes depuis 1970 ; `null` si absente ou illisible. */
  expiresAtMs: number | null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Lecture tolérante de la réponse du serveur
// ---------------------------------------------------------------------------------------------------------------------

export const DEFAULT_MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_SNIPPET_LENGTH = 300;
const MAX_WARNINGS = 10;
const MAX_WARNING_LENGTH = 400;
const MAX_ERROR_MESSAGE_LENGTH = 300;

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isWholeNumber = (value: unknown): value is number => isNumber(value) && Number.isInteger(value);
const asObject = (value: unknown): Record<string, unknown> => (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const asText = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.replace(/\s+/g, ' ').trim();
  return text === '' ? null : text.slice(0, max);
};

export function parseExtractionCapabilities(raw: unknown): ExtractionCapabilities {
  const body = asObject(raw);
  return {
    available: body.available === true,
    maxFileBytes: isWholeNumber(body.maxFileBytes) && body.maxFileBytes > 0 ? body.maxFileBytes : DEFAULT_MAX_FILE_BYTES,
    maxPages: isWholeNumber(body.maxPages) && body.maxPages > 0 ? body.maxPages : null,
  };
}

export function parseExtractionStart(raw: unknown): ExtractionStart | null {
  const body = asObject(raw);
  if (typeof body.jobId !== 'string' || body.jobId.trim() === '') {
    return null;
  }
  const expires = typeof body.expiresAt === 'string' ? Date.parse(body.expiresAt) : NaN;
  return { jobId: body.jobId, expiresAtMs: Number.isFinite(expires) ? expires : null };
}

/** Libellé d'une valeur brute venue de l'extraction : la valeur elle-même quand elle n'est pas dans le catalogue. */
function labelOr(value: string, labels: Readonly<Partial<Record<string, string>>>): string {
  return labels[value] ?? value;
}

/** Le texte de la valeur est-il du bon type pour ce champ ? Une valeur de mauvais type est écartée, jamais convertie. */
function readValue(field: ExtractionFieldKey, raw: unknown): string | number | null {
  if (TEXT_FIELDS.includes(field)) {
    return asText(raw, 200);
  }
  if (CENTS_FIELDS.includes(field) || field === 'initialTermMonths') {
    return isWholeNumber(raw) && raw >= 0 ? raw : null;
  }
  if (PERCENT_FIELDS.includes(field)) {
    return isNumber(raw) && raw >= 0 ? raw : null;
  }
  if (field === 'rateType') {
    return RATE_TYPES.includes(raw as RateType) ? (raw as string) : null;
  }
  if (field === 'insuranceMode') {
    return INSURANCE_MODES.includes(raw as InsuranceMode) ? (raw as string) : null;
  }
  if (field === 'guaranteeKind') {
    return raw === 'NONE' ? null : GUARANTEE_KINDS.includes(raw as GuaranteeKind) ? (raw as string) : null;
  }
  if (field === 'startDate') {
    return typeof raw === 'string' && isValidDateInput(raw.slice(0, 10)) ? raw.slice(0, 10) : null;
  }
  return null;
}

const CONFIDENCE_RANK: Record<ExtractionConfidence, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

/** Une confiance inconnue ou absente est traitée comme la plus basse : jamais présentée comme sûre. */
function readConfidence(raw: unknown): ExtractionConfidence {
  return raw === 'HIGH' || raw === 'MEDIUM' || raw === 'LOW' ? raw : 'LOW';
}

function parseField(raw: unknown): ExtractedField | null {
  const item = asObject(raw);
  const field = EXTRACTION_FIELD_ORDER.find((key) => key === item.field);
  if (!field) {
    return null;
  }
  const value = readValue(field, item.value);
  if (value === null) {
    return null;
  }
  return {
    field,
    value,
    confidence: readConfidence(item.confidence),
    snippet: asText(item.snippet, MAX_SNIPPET_LENGTH),
    page: isWholeNumber(item.page) && item.page >= 1 ? item.page : null,
  };
}

export function parseExtractionResult(raw: unknown): ExtractionResult | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const body = raw as Record<string, unknown>;
  // Au plus une valeur par champ : si le serveur en envoie plusieurs, on garde la plus fiable (la première à égalité).
  const best = new Map<ExtractionFieldKey, ExtractedField>();
  for (const item of Array.isArray(body.fields) ? body.fields : []) {
    const parsed = parseField(item);
    const known = parsed ? best.get(parsed.field) : undefined;
    if (parsed && (!known || CONFIDENCE_RANK[parsed.confidence] > CONFIDENCE_RANK[known.confidence])) {
      best.set(parsed.field, parsed);
    }
  }
  const warnings = (Array.isArray(body.warnings) ? body.warnings : [])
    .map((warning) => asText(warning, MAX_WARNING_LENGTH))
    .filter((warning): warning is string => warning !== null)
    .slice(0, MAX_WARNINGS);
  return {
    source: body.source === 'TEXT_LAYER' || body.source === 'OCR' ? body.source : null,
    pages: isWholeNumber(body.pages) && body.pages > 0 ? body.pages : null,
    engine: typeof body.engine === 'string' && body.engine.trim() !== '' ? body.engine.slice(0, 40) : null,
    fields: EXTRACTION_FIELD_ORDER.flatMap((key) => {
      const field = best.get(key);
      return field ? [field] : [];
    }),
    warnings,
  };
}

const STATUSES: readonly ExtractionStatus[] = ['PENDING', 'RUNNING', 'DONE', 'FAILED'];
const STAGES: readonly ExtractionStage[] = ['TEXT', 'OCR', 'PARSING'];

export function parseExtractionJob(raw: unknown): ExtractionJob | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const body = raw as Record<string, unknown>;
  const status = STATUSES.find((value) => value === body.status);
  if (!status) {
    return null;
  }
  const progress = isNumber(body.progressPercent) ? Math.round(Math.min(100, Math.max(0, body.progressPercent))) : status === 'DONE' ? 100 : 0;
  return {
    status,
    stage: STAGES.find((value) => value === body.stage) ?? null,
    progressPercent: progress,
    result: status === 'DONE' ? parseExtractionResult(body.result) : null,
    errorMessage: asText(asObject(body.error).message, MAX_ERROR_MESSAGE_LENGTH),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Libellés et formats d'affichage
// ---------------------------------------------------------------------------------------------------------------------

export const CONFIDENCE_LABEL: Record<ExtractionConfidence, string> = { HIGH: 'Sûr', MEDIUM: 'À vérifier', LOW: 'Douteux' };

export const CONFIDENCE_EXPLANATION: Record<ExtractionConfidence, string> = {
  HIGH: 'Sûr : le libellé et la valeur sont nets dans le contrat. À relire quand même.',
  MEDIUM: 'À vérifier : le libellé est proche ou la valeur a été corrigée à la lecture.',
  LOW: 'Douteux : la valeur est déduite ou la lecture est peu fiable. Ne la gardez que si vous l’avez vérifiée.',
};

/** Une phrase courte sous les valeurs qui ne sont pas « Sûr » : on ne les présente jamais comme certaines. */
export const CONFIDENCE_HINT: Record<ExtractionConfidence, string | null> = {
  HIGH: null,
  MEDIUM: 'Vérifiez cette valeur dans votre contrat avant de la reprendre.',
  LOW: 'Lecture peu fiable : ne la reprenez que si vous l’avez vérifiée dans votre contrat.',
};

/** Seules les valeurs « Sûr » sont cochées d'office : les autres demandent un geste volontaire. */
export const isCheckedByDefault = (confidence: ExtractionConfidence): boolean => confidence === 'HIGH';

export const STAGE_LABEL: Record<ExtractionStage, string> = { TEXT: 'Lecture du texte', OCR: 'Reconnaissance des caractères', PARSING: 'Analyse' };

export function describeExtractionStage(job: Pick<ExtractionJob, 'status' | 'stage'>): string {
  if (job.stage) {
    return STAGE_LABEL[job.stage];
  }
  return job.status === 'PENDING' ? 'En attente de démarrage' : 'Lecture en cours';
}

export const SOURCE_NOTE: Record<ExtractionSource, string> = {
  TEXT_LAYER: 'Le texte a été lu directement dans le PDF.',
  OCR: 'Le document a été lu par reconnaissance de caractères : une lecture peut se tromper, surtout sur un scan ou une photo de mauvaise qualité.',
};

export function formatExtractedValue(item: Pick<ExtractedField, 'field' | 'value'>): string {
  const { field, value } = item;
  if (typeof value === 'number') {
    if (CENTS_FIELDS.includes(field)) {
      return formatCentsShort(value);
    }
    if (PERCENT_FIELDS.includes(field)) {
      return formatRate(value);
    }
    return field === 'initialTermMonths' ? describeTerm(value) : String(value);
  }
  switch (field) {
    case 'rateType':
      return labelOr(value, RATE_TYPE_LABEL);
    case 'insuranceMode':
      return labelOr(value, INSURANCE_MODE_LABEL);
    case 'guaranteeKind':
      return labelOr(value, GUARANTEE_KIND_LABEL);
    case 'startDate':
      return formatLongDateInput(value);
    default:
      return value;
  }
}

interface MissingGroup {
  label: string;
  fields: readonly ExtractionFieldKey[];
}

const MISSING_GROUPS: readonly MissingGroup[] = [
  { label: EXTRACTION_FIELD_LABEL.lender, fields: ['lender'] },
  { label: EXTRACTION_FIELD_LABEL.contractReference, fields: ['contractReference'] },
  { label: EXTRACTION_FIELD_LABEL.principalCents, fields: ['principalCents'] },
  { label: EXTRACTION_FIELD_LABEL.annualRatePercent, fields: ['annualRatePercent'] },
  { label: EXTRACTION_FIELD_LABEL.rateType, fields: ['rateType'] },
  { label: 'Mensualité', fields: ['monthlyPaymentCents'] },
  { label: EXTRACTION_FIELD_LABEL.initialTermMonths, fields: ['initialTermMonths'] },
  { label: EXTRACTION_FIELD_LABEL.startDate, fields: ['startDate'] },
  { label: 'Assurance', fields: ['insuranceMode', 'insuranceMonthlyCents', 'insuranceRatePercent'] },
  { label: EXTRACTION_FIELD_LABEL.feesCents, fields: ['feesCents'] },
  { label: 'Garantie', fields: ['guaranteeKind', 'guaranteeCents'] },
];

/** Les informations qu'on aurait pu lire mais qui ne figurent pas dans le résultat : à saisir à la main. */
export function missingFieldLabels(fields: readonly Pick<ExtractedField, 'field'>[]): string[] {
  const found = new Set(fields.map((item) => item.field));
  return MISSING_GROUPS.filter((group) => !group.fields.some((field) => found.has(field))).map((group) => group.label);
}

/** « Capital restant dû », « nom », « jour de prélèvement » ne se lisent pas dans un contrat : toujours à saisir. */
export const NEVER_EXTRACTED_NOTE = 'Le nom du crédit, le capital restant dû et le jour de prélèvement ne se lisent pas dans un contrat : vous les saisirez dans le formulaire.';

// ---------------------------------------------------------------------------------------------------------------------
// Validation par rapport aux bornes du formulaire
// ---------------------------------------------------------------------------------------------------------------------

export const OUT_OF_BOUNDS_REASON = 'valeur hors des limites du formulaire';

const hasTwoDecimalsAtMost = (value: number): boolean => Math.abs(Math.round(value * 100) / 100 - value) < 1e-9;

/** `null` si la valeur peut aller dans le formulaire ; sinon la raison (courte, en français) pour laquelle elle sera ignorée. */
export function extractedFieldProblem(item: Pick<ExtractedField, 'field' | 'value'>): string | null {
  const { field, value } = item;
  const out = OUT_OF_BOUNDS_REASON;
  switch (field) {
    case 'lender':
      return typeof value === 'string' && value.length <= MAX_LENDER_LENGTH ? null : out;
    case 'contractReference':
      return typeof value === 'string' && value.length <= MAX_CONTRACT_REFERENCE_LENGTH ? null : out;
    case 'principalCents':
    case 'monthlyPaymentCents':
      return typeof value === 'number' && value > 0 && value <= MAX_AMOUNT_CENTS ? null : out;
    case 'insuranceMonthlyCents':
    case 'feesCents':
    case 'guaranteeCents':
      return typeof value === 'number' && value >= 0 && value <= MAX_AMOUNT_CENTS ? null : out;
    case 'annualRatePercent':
      return typeof value === 'number' && value <= MAX_RATE_PERCENT && hasTwoDecimalsAtMost(value) ? null : out;
    case 'insuranceRatePercent':
      return typeof value === 'number' && value <= MAX_INSURANCE_RATE_PERCENT && hasTwoDecimalsAtMost(value) ? null : out;
    case 'initialTermMonths':
      return typeof value === 'number' && value >= MIN_TERM_MONTHS && value <= MAX_TERM_MONTHS ? null : out;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Application sélective dans le formulaire
// ---------------------------------------------------------------------------------------------------------------------

/** Les repères « Prérempli depuis le contrat » : un par champ visible du formulaire. */
export type PrefillKey =
  | 'lender'
  | 'contractReference'
  | 'principal'
  | 'rate'
  | 'rateType'
  | 'monthlyPayment'
  | 'term'
  | 'startDate'
  | 'insuranceMode'
  | 'insurance'
  | 'insuranceRate'
  | 'fees'
  | 'guaranteeKind'
  | 'guarantee';

export type PrefillMarks = Partial<Record<PrefillKey, ExtractionConfidence>>;

const FORM_KEY_TO_PREFILL: Partial<Record<keyof DebtFormValues, PrefillKey>> = {
  lender: 'lender',
  contractReference: 'contractReference',
  principal: 'principal',
  rate: 'rate',
  rateType: 'rateType',
  monthlyPayment: 'monthlyPayment',
  termUnit: 'term',
  termMonths: 'term',
  termYears: 'term',
  termExtraMonths: 'term',
  startDate: 'startDate',
  insuranceMode: 'insuranceMode',
  insurance: 'insurance',
  insuranceRate: 'insuranceRate',
  fees: 'fees',
  guaranteeKind: 'guaranteeKind',
  guarantee: 'guarantee',
};

/** Retire le repère d'un champ que l'utilisateur vient de modifier (renvoie le même objet s'il n'y avait rien à retirer). */
export function clearPrefillMark(marks: PrefillMarks, formKey: keyof DebtFormValues): PrefillMarks {
  const key = FORM_KEY_TO_PREFILL[formKey];
  if (!key || marks[key] === undefined) {
    return marks;
  }
  const { [key]: _removed, ...rest } = marks;
  return rest;
}

export const PREFILL_MARK_TEXT = 'Prérempli depuis le contrat : à vérifier';
export const PREFILL_MARK_UNSURE_TEXT = 'Prérempli depuis le contrat : à vérifier, lecture peu sûre';

export interface SkippedField {
  field: ExtractionFieldKey;
  label: string;
  reason: string;
}

export interface ApplyExtractionResult {
  values: DebtFormValues;
  applied: ExtractionFieldKey[];
  skipped: SkippedField[];
  marks: PrefillMarks;
}

/**
 * Applique UNIQUEMENT les champs fournis (ceux que l'utilisateur a cochés) aux valeurs du formulaire, avec les conversions
 * du domaine existant. Ce qui n'est pas fourni n'est jamais touché ni deviné. Une valeur hors bornes, ou qui n'a pas de
 * sens sans une autre information (taux d'assurance sans mode de calcul, montant de garantie sans type), est ignorée et
 * signalée.
 */
export function applyExtractedFields(current: DebtFormValues, chosen: readonly ExtractedField[]): ApplyExtractionResult {
  let values: DebtFormValues = { ...current };
  const applied: ExtractionFieldKey[] = [];
  const skipped: SkippedField[] = [];
  let marks: PrefillMarks = {};

  const byField = new Map<ExtractionFieldKey, ExtractedField>();
  for (const item of chosen) {
    if (!byField.has(item.field)) {
      byField.set(item.field, item);
    }
  }

  const skip = (item: ExtractedField, reason: string) => skipped.push({ field: item.field, label: EXTRACTION_FIELD_LABEL[item.field], reason });
  /** Une valeur valide vis-à-vis des bornes, ou `undefined` (et le champ est signalé comme ignoré). */
  const usable = (field: ExtractionFieldKey): ExtractedField | undefined => {
    const item = byField.get(field);
    if (!item) {
      return undefined;
    }
    const problem = extractedFieldProblem(item);
    if (problem) {
      skip(item, problem);
      return undefined;
    }
    return item;
  };
  const put = (item: ExtractedField, patch: Partial<DebtFormValues>, key: PrefillKey, mark = true) => {
    values = { ...values, ...patch };
    applied.push(item.field);
    if (mark) {
      marks = { ...marks, [key]: item.confidence };
    }
  };
  const text = (item: ExtractedField) => String(item.value);
  const money = (item: ExtractedField) => (item.value === 0 ? '' : centsToInputValue(Number(item.value)));

  const lender = usable('lender');
  if (lender) {
    put(lender, { lender: text(lender) }, 'lender');
  }
  const reference = usable('contractReference');
  if (reference) {
    put(reference, { contractReference: text(reference) }, 'contractReference');
  }
  const principal = usable('principalCents');
  if (principal) {
    put(principal, { principal: centsToInputValue(Number(principal.value)) }, 'principal');
  }
  const rate = usable('annualRatePercent');
  if (rate) {
    put(rate, { rate: percentToInput(Number(rate.value)) }, 'rate');
  }
  const rateType = usable('rateType');
  if (rateType) {
    put(rateType, { rateType: rateType.value as RateType }, 'rateType');
  }
  const monthly = usable('monthlyPaymentCents');
  if (monthly) {
    put(monthly, { monthlyPayment: centsToInputValue(Number(monthly.value)) }, 'monthlyPayment');
  }
  const term = usable('initialTermMonths');
  if (term) {
    put(term, termToForm(Number(term.value)), 'term');
  }
  const startDate = usable('startDate');
  if (startDate) {
    put(startDate, { startDate: text(startDate) }, 'startDate');
  }

  // Assurance : le mode de calcul décide quel champ reçoit quoi. On ne devine jamais le mode à partir d'un taux.
  const insuranceMode = usable('insuranceMode');
  const insuranceMonthly = usable('insuranceMonthlyCents');
  const insuranceRate = usable('insuranceRatePercent');
  const mode = insuranceMode ? (insuranceMode.value as InsuranceMode) : undefined;
  if (mode === 'FIXED' || (mode === undefined && insuranceMonthly)) {
    if (insuranceMode) {
      put(insuranceMode, { insuranceMode: 'FIXED' }, 'insuranceMode');
    } else if (insuranceMonthly && values.insuranceMode !== 'FIXED') {
      values = { ...values, insuranceMode: 'FIXED' };
      marks = { ...marks, insuranceMode: insuranceMonthly.confidence };
    }
    if (insuranceMonthly) {
      put(insuranceMonthly, { insurance: money(insuranceMonthly) }, 'insurance', insuranceMonthly.value !== 0);
    }
    if (insuranceRate) {
      skip(insuranceRate, 'l’assurance est un montant fixe par mois, pas un pourcentage');
    }
  } else if (mode !== undefined && insuranceMode) {
    put(insuranceMode, { insuranceMode: mode }, 'insuranceMode');
    if (insuranceRate) {
      put(insuranceRate, { insuranceRate: percentToInput(Number(insuranceRate.value)) }, 'insuranceRate');
    }
    if (insuranceMonthly) {
      skip(insuranceMonthly, 'l’assurance est calculée en pourcentage, pas en montant fixe');
    }
  } else if (insuranceRate) {
    if (values.insuranceMode === 'FIXED') {
      skip(insuranceRate, 'on ne sait pas sur quel capital ce taux s’applique : choisissez d’abord comment l’assurance est calculée, puis saisissez le taux');
    } else {
      put(insuranceRate, { insuranceRate: percentToInput(Number(insuranceRate.value)) }, 'insuranceRate');
    }
  }

  const fees = usable('feesCents');
  if (fees) {
    put(fees, { fees: money(fees) }, 'fees', fees.value !== 0);
  }

  // Garantie : un montant sans type de garantie est refusé par le formulaire, et on ne devine pas le type.
  const guaranteeKind = usable('guaranteeKind');
  const guarantee = usable('guaranteeCents');
  if (guaranteeKind) {
    put(guaranteeKind, { guaranteeKind: guaranteeKind.value as GuaranteeKind }, 'guaranteeKind');
  }
  if (guarantee) {
    if (values.guaranteeKind === 'NONE') {
      skip(guarantee, 'le type de garantie (caution, hypothèque…) n’est pas précisé : choisissez-le, puis saisissez le montant');
    } else {
      put(guarantee, { guarantee: money(guarantee) }, 'guarantee', guarantee.value !== 0);
    }
  }

  // Un champ coché mais ignoré ne doit pas figurer parmi les champs remplis.
  const skippedKeys = new Set(skipped.map((item) => item.field));
  return { values, applied: applied.filter((field) => !skippedKeys.has(field)), skipped, marks };
}

/** Le formulaire est-il encore tel qu'à l'ouverture ? L'import n'est proposé que dans ce cas : il n'écrase rien. */
export function isFormUntouched(current: DebtFormValues, initial: DebtFormValues): boolean {
  return (Object.keys(initial) as (keyof DebtFormValues)[]).every((key) => current[key] === initial[key]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Choix du fichier
// ---------------------------------------------------------------------------------------------------------------------

export const CONTRACT_FILE_ACCEPT = 'application/pdf,image/png,image/jpeg';
const CONTRACT_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
const CONTRACT_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg'];

export interface ContractFileInfo {
  name: string;
  type: string;
  size: number;
}

export function formatFileSize(bytes: number): string {
  const format = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
  return bytes >= 1024 * 1024 ? `${format.format(bytes / (1024 * 1024))} Mo` : `${format.format(Math.max(1, Math.round(bytes / 1024)))} Ko`;
}

/** Vérification faite AVANT l'envoi : type (PDF, PNG, JPEG) et taille. `null` si le fichier peut être envoyé. */
export function contractFileError(file: ContractFileInfo, maxFileBytes: number): string | null {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (type === 'image/heic' || type === 'image/heif' || name.endsWith('.heic') || name.endsWith('.heif')) {
    return 'Les photos au format HEIC ne sont pas lues. Choisissez une photo JPEG, ou prenez-la directement avec l’appareil photo.';
  }
  const knownType = type !== '' && type !== 'application/octet-stream';
  const typeOk = knownType ? CONTRACT_MIME_TYPES.includes(type) : CONTRACT_EXTENSIONS.some((extension) => name.endsWith(extension));
  if (!typeOk) {
    return 'Ce type de fichier n’est pas pris en charge. Choisissez un PDF, une image PNG ou une photo JPEG.';
  }
  if (file.size <= 0) {
    return 'Ce fichier est vide. Choisissez-en un autre.';
  }
  if (file.size > maxFileBytes) {
    return `Ce fichier est trop volumineux (${formatFileSize(file.size)}). La limite est de ${formatFileSize(maxFileBytes)} : réduisez-le ou prenez une photo plus légère.`;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Suivi du travail et messages d'erreur
// ---------------------------------------------------------------------------------------------------------------------

export const FIRST_POLL_DELAY_MS = 1500;
export const MAX_POLL_DELAY_MS = 4000;
/** Sans date d'expiration lisible, on arrête de suivre au bout de ce délai. */
export const MAX_FOLLOW_MS = 10 * 60 * 1000;
/** Nombre d'échecs réseau de suite avant d'arrêter le suivi (l'utilisateur peut alors réessayer). */
export const MAX_POLL_NETWORK_FAILURES = 4;

/** Délai avant la prochaine interrogation : 1,5 s au début, puis de plus en plus espacé, plafonné. */
export function nextPollDelayMs(attempt: number): number {
  if (attempt < 5) {
    return FIRST_POLL_DELAY_MS;
  }
  return Math.min(MAX_POLL_DELAY_MS, FIRST_POLL_DELAY_MS + (attempt - 4) * 500);
}

export type ExtractionHttpFailure = { kind: 'network' } | { kind: 'http'; status: number };

export const CONSENT_TEXT = 'Le contrat est lu sur le serveur de l’application pour en extraire des informations, puis supprimé immédiatement. Il n’est pas conservé.';
export const EXPIRED_MESSAGE = 'Le résultat n’est plus disponible : il est supprimé au bout de quelques minutes. Relancez la lecture si besoin.';
export const OFFLINE_MESSAGE = 'Pas de connexion : vérifiez votre réseau, puis réessayez.';
export const GENERIC_FAILURE_MESSAGE = 'La lecture du contrat a échoué. Vous pouvez réessayer ou saisir le crédit à la main.';
export const EMPTY_RESULT_MESSAGE = 'La lecture n’a rien donné d’exploitable. Vous pouvez réessayer avec un fichier plus net, ou saisir le crédit à la main.';

export function describeExtractionFailure(failure: ExtractionHttpFailure, step: 'start' | 'poll', maxFileBytes: number = DEFAULT_MAX_FILE_BYTES): string {
  if (failure.kind === 'network') {
    return OFFLINE_MESSAGE;
  }
  switch (failure.status) {
    case 400:
    case 413:
    case 415:
      return `Ce fichier n’a pas pu être lu. Vérifiez qu’il s’agit d’un PDF, d’une image PNG ou JPEG de moins de ${formatFileSize(maxFileBytes)}, et que le PDF n’est pas protégé par un mot de passe.`;
    case 429:
      return 'Une lecture est déjà en cours ou vous en avez fait trop cette heure. Patientez un peu, puis réessayez.';
    case 503:
      return 'La lecture des contrats n’est pas disponible pour le moment. Vous pouvez saisir votre crédit à la main.';
    case 404:
      return step === 'poll' ? EXPIRED_MESSAGE : GENERIC_FAILURE_MESSAGE;
    default:
      return GENERIC_FAILURE_MESSAGE;
  }
}

/** Le message d'un travail en échec : celui du serveur (en français, sans extrait du document) ou un message par défaut. */
export function describeFailedJob(job: Pick<ExtractionJob, 'errorMessage'>): string {
  return job.errorMessage ?? GENERIC_FAILURE_MESSAGE;
}

/** Un résumé du préremplissage, affiché en haut du formulaire. */
export function describePrefill(result: Pick<ApplyExtractionResult, 'applied' | 'skipped'>): string {
  const count = result.applied.length;
  if (count === 0) {
    return 'Aucune information n’a été reprise dans le formulaire.';
  }
  return `${count > 1 ? `${count} informations ont été reprises` : '1 information a été reprise'} du contrat. Relisez chaque champ marqué « Prérempli », corrigez si besoin, puis enregistrez : rien n’est enregistré tant que vous n’avez pas validé.`;
}
