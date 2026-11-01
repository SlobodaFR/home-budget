import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  DEBT_KINDS,
  DEBT_RATE_TYPES,
  DebtKind,
  DebtRateType,
  GUARANTEE_KINDS,
  GuaranteeKind,
  INSURANCE_MODES,
  InsuranceMode,
  MAX_DEBT_CENTS,
  MAX_DEBT_NAME_LENGTH,
  MAX_INITIAL_TERM_MONTHS,
  MAX_INSURANCE_QUOTITY_PERCENT,
  MIN_INITIAL_TERM_MONTHS,
  MIN_INSURANCE_QUOTITY_PERCENT,
} from '../../../domain/debt/debt';

/** Garde-fou de taille sur les textes libres ; la longueur exacte (après trim) est vérifiée par le domaine. */
const TEXT_SANITY_LIMIT = 2000;

export class CreateDebtDto {
  @IsString({ message: 'name doit être un texte' })
  @IsNotEmpty({ message: 'name ne doit pas être vide' })
  @MaxLength(MAX_DEBT_NAME_LENGTH, {
    message: `name est trop long (${MAX_DEBT_NAME_LENGTH} caractères au plus)`,
  })
  name!: string;

  @IsIn(DEBT_KINDS, { message: `kind doit être ${DEBT_KINDS.join(', ')}` })
  kind!: DebtKind;

  @IsInt({ message: 'principalCents doit être un entier (en centimes)' })
  @Min(1, { message: 'principalCents doit être strictement positif' })
  @Max(MAX_DEBT_CENTS, { message: 'principalCents est trop élevé' })
  principalCents!: number;

  @IsInt({ message: 'remainingCents doit être un entier (en centimes)' })
  @Min(0, { message: 'remainingCents doit être positif ou nul' })
  @Max(MAX_DEBT_CENTS, { message: 'remainingCents est trop élevé' })
  remainingCents!: number;

  /** Nombre avec 2 décimales au plus (vérifié par le domaine). */
  @IsNumber(
    { allowNaN: false, allowInfinity: false },
    { message: 'annualRatePercent doit être un nombre' },
  )
  @Min(0, { message: 'annualRatePercent doit être compris entre 0 et 100' })
  @Max(100, { message: 'annualRatePercent doit être compris entre 0 et 100' })
  annualRatePercent!: number;

  @IsInt({ message: 'monthlyPaymentCents doit être un entier (en centimes)' })
  @Min(0, { message: 'monthlyPaymentCents doit être positif ou nul' })
  @Max(MAX_DEBT_CENTS, { message: 'monthlyPaymentCents est trop élevé' })
  monthlyPaymentCents!: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'startDate doit être au format AAAA-MM-JJ',
  })
  startDate!: string;

  @IsInt({ message: 'paymentDay doit être un entier de 1 à 28' })
  @Min(1, { message: 'paymentDay doit être compris entre 1 et 28' })
  @Max(28, { message: 'paymentDay doit être compris entre 1 et 28' })
  paymentDay!: number;

  @IsInt({ message: 'insuranceMonthlyCents doit être un entier (en centimes)' })
  @Min(0, { message: 'insuranceMonthlyCents doit être positif ou nul' })
  @Max(MAX_DEBT_CENTS, { message: 'insuranceMonthlyCents est trop élevé' })
  insuranceMonthlyCents!: number;

  @IsOptional()
  @IsString({ message: 'recurringId doit être un identifiant ou null' })
  @MaxLength(100, { message: 'recurringId est trop long' })
  recurringId?: string | null;

  // Tranche 12 : tous optionnels (absent ou null = valeur par défaut du contrat).

  @IsOptional()
  @IsString({ message: 'lender doit être un texte' })
  @MaxLength(TEXT_SANITY_LIMIT, { message: 'lender est trop long' })
  lender?: string | null;

  @IsOptional()
  @IsString({ message: 'contractReference doit être un texte' })
  @MaxLength(TEXT_SANITY_LIMIT, { message: 'contractReference est trop long' })
  contractReference?: string | null;

  @IsOptional()
  @IsInt({
    message: `initialTermMonths doit être un nombre entier de mois (${MIN_INITIAL_TERM_MONTHS} à ${MAX_INITIAL_TERM_MONTHS})`,
  })
  @Min(MIN_INITIAL_TERM_MONTHS, {
    message: `initialTermMonths doit être compris entre ${MIN_INITIAL_TERM_MONTHS} et ${MAX_INITIAL_TERM_MONTHS}`,
  })
  @Max(MAX_INITIAL_TERM_MONTHS, {
    message: `initialTermMonths doit être compris entre ${MIN_INITIAL_TERM_MONTHS} et ${MAX_INITIAL_TERM_MONTHS}`,
  })
  initialTermMonths?: number | null;

  @IsOptional()
  @IsIn(DEBT_RATE_TYPES, {
    message: `rateType doit être ${DEBT_RATE_TYPES.join(', ')} ou null`,
  })
  rateType?: DebtRateType | null;

  @IsOptional()
  @IsIn(INSURANCE_MODES, {
    message: `insuranceMode doit être ${INSURANCE_MODES.join(', ')}`,
  })
  insuranceMode?: InsuranceMode | null;

  /** Nombre avec 2 décimales au plus (vérifié par le domaine) ; obligatoire pour les modes en pourcentage. */
  @IsOptional()
  @IsNumber(
    { allowNaN: false, allowInfinity: false },
    { message: 'insuranceRatePercent doit être un nombre' },
  )
  @Min(0, { message: 'insuranceRatePercent doit être compris entre 0 et 20' })
  @Max(20, { message: 'insuranceRatePercent doit être compris entre 0 et 20' })
  insuranceRatePercent?: number | null;

  @IsOptional()
  @IsInt({
    message: `insuranceQuotityPercent doit être un entier de ${MIN_INSURANCE_QUOTITY_PERCENT} à ${MAX_INSURANCE_QUOTITY_PERCENT}`,
  })
  @Min(MIN_INSURANCE_QUOTITY_PERCENT, {
    message: `insuranceQuotityPercent doit être compris entre ${MIN_INSURANCE_QUOTITY_PERCENT} et ${MAX_INSURANCE_QUOTITY_PERCENT}`,
  })
  @Max(MAX_INSURANCE_QUOTITY_PERCENT, {
    message: `insuranceQuotityPercent doit être compris entre ${MIN_INSURANCE_QUOTITY_PERCENT} et ${MAX_INSURANCE_QUOTITY_PERCENT}`,
  })
  insuranceQuotityPercent?: number | null;

  @IsOptional()
  @IsInt({ message: 'feesCents doit être un entier (en centimes)' })
  @Min(0, { message: 'feesCents doit être positif ou nul' })
  @Max(MAX_DEBT_CENTS, { message: 'feesCents est trop élevé' })
  feesCents?: number | null;

  @IsOptional()
  @IsIn(GUARANTEE_KINDS, {
    message: `guaranteeKind doit être ${GUARANTEE_KINDS.join(', ')}`,
  })
  guaranteeKind?: GuaranteeKind | null;

  @IsOptional()
  @IsInt({ message: 'guaranteeCents doit être un entier (en centimes)' })
  @Min(0, { message: 'guaranteeCents doit être positif ou nul' })
  @Max(MAX_DEBT_CENTS, { message: 'guaranteeCents est trop élevé' })
  guaranteeCents?: number | null;

  @IsOptional()
  @IsString({ message: 'notes doit être un texte' })
  @MaxLength(TEXT_SANITY_LIMIT, { message: 'notes est trop long' })
  notes?: string | null;
}

export class UpdateDebtDto extends CreateDebtDto {
  @IsOptional()
  @IsBoolean({ message: 'archived doit être vrai ou faux' })
  archived?: boolean;
}

export class WhatIfQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'extraMonthlyCents doit être un entier (en centimes)' })
  @Min(0, { message: 'extraMonthlyCents doit être positif ou nul' })
  extraMonthlyCents: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'lumpSumCents doit être un entier (en centimes)' })
  @Min(0, { message: 'lumpSumCents doit être positif ou nul' })
  lumpSumCents: number = 0;
}
