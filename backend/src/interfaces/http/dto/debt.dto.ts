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
  DebtKind,
  MAX_DEBT_CENTS,
  MAX_DEBT_NAME_LENGTH,
} from '../../../domain/debt/debt';

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
