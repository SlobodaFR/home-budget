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
  ValidateIf,
} from 'class-validator';
import { CRECHE_KINDS, CrecheKind } from '../../../domain/aid/creche-estimate';
import { MAX_CHILDREN } from '../../../domain/aid/fiscal-profile';
import { BLOCS, Bloc } from '../../../domain/shared/bloc';
import { TransactionKind } from '../../../domain/transaction/transaction';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class SaveRecurringDto {
  @IsIn(['INCOME', 'EXPENSE'], {
    message: 'kind doit être INCOME ou EXPENSE',
  })
  kind!: TransactionKind;

  @ValidateIf((o: SaveRecurringDto) => o.kind === 'EXPENSE')
  @IsIn(BLOCS, { message: 'bloc doit être FIXE, COURANT, PLAISIR ou EPARGNE' })
  bloc?: Bloc;

  @IsString({ message: 'label doit être un texte' })
  @IsNotEmpty({ message: 'label ne doit pas être vide' })
  @MaxLength(80, { message: 'label est trop long (80 caractères au plus)' })
  label!: string;

  @IsInt({ message: 'amountCents doit être un entier (en centimes)' })
  @Min(1, { message: 'amountCents doit être strictement positif' })
  amountCents!: number;

  @IsOptional()
  @IsInt({ message: 'dayOfMonth doit être un entier de 1 à 31 ou null' })
  @Min(1, { message: 'dayOfMonth doit être compris entre 1 et 31' })
  @Max(31, { message: 'dayOfMonth doit être compris entre 1 et 31' })
  dayOfMonth?: number | null;

  @Matches(DATE_PATTERN, {
    message: 'startDate doit être au format AAAA-MM-JJ',
  })
  startDate!: string;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'endDate doit être au format AAAA-MM-JJ' })
  endDate?: string | null;

  @IsBoolean({ message: 'active doit être vrai ou faux' })
  active!: boolean;

  @IsOptional()
  @IsString({ message: 'aidRuleId doit être un texte' })
  aidRuleId?: string | null;
}

export class SaveSafetyNetDto {
  @IsInt({ message: 'savedCents doit être un entier (en centimes)' })
  @Min(0, { message: 'savedCents doit être positif ou nul' })
  savedCents!: number;

  @Matches(DATE_PATTERN, { message: 'asOf doit être au format AAAA-MM-JJ' })
  asOf!: string;

  @IsInt({ message: 'targetMonths doit être un entier de 1 à 24' })
  @Min(1, { message: 'targetMonths doit être compris entre 1 et 24' })
  @Max(24, { message: 'targetMonths doit être compris entre 1 et 24' })
  targetMonths!: number;
}

export class SaveFiscalProfileDto {
  @IsInt({
    message: `childrenUnderSix doit être un entier de 0 à ${MAX_CHILDREN}`,
  })
  @Min(0, {
    message: `childrenUnderSix doit être compris entre 0 et ${MAX_CHILDREN}`,
  })
  @Max(MAX_CHILDREN, {
    message: `childrenUnderSix doit être compris entre 0 et ${MAX_CHILDREN}`,
  })
  childrenUnderSix!: number;

  @IsInt({
    message: `dependentChildren doit être un entier de 0 à ${MAX_CHILDREN}`,
  })
  @Min(0, {
    message: `dependentChildren doit être compris entre 0 et ${MAX_CHILDREN}`,
  })
  @Max(MAX_CHILDREN, {
    message: `dependentChildren doit être compris entre 0 et ${MAX_CHILDREN}`,
  })
  dependentChildren!: number;

  @IsBoolean({ message: 'firstYearHomeServices doit être vrai ou faux' })
  firstYearHomeServices!: boolean;
}

export class AidsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'year doit être une année (AAAA)' })
  @Min(2000, { message: 'year doit être compris entre 2000 et 2100' })
  @Max(2100, { message: 'year doit être compris entre 2000 et 2100' })
  year?: number;
}

export class CrecheEstimateQueryDto {
  @Type(() => Number)
  @IsInt({
    message:
      'annualResourcesCents doit être un entier positif ou nul (en centimes)',
  })
  @Min(0, { message: 'annualResourcesCents doit être positif ou nul' })
  @Max(10_000_000_000, { message: 'annualResourcesCents est trop élevé' })
  annualResourcesCents!: number;

  @Type(() => Number)
  @IsInt({ message: 'children doit être un entier supérieur ou égal à 1' })
  @Min(1, { message: 'children doit être supérieur ou égal à 1' })
  children!: number;

  @Type(() => Number)
  @IsNumber(
    { allowNaN: false, allowInfinity: false },
    { message: 'hoursPerMonth doit être un nombre' },
  )
  @Min(0, { message: 'hoursPerMonth doit être compris entre 0 et 400' })
  @Max(400, { message: 'hoursPerMonth doit être compris entre 0 et 400' })
  hoursPerMonth!: number;

  @IsOptional()
  @IsIn(CRECHE_KINDS, { message: 'kind doit être COLLECTIVE' })
  kind: CrecheKind = 'COLLECTIVE';
}
