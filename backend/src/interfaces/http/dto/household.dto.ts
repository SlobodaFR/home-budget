import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { BLOCS, Bloc } from '../../../domain/shared/bloc';
import {
  CONTRIBUTION_MODES,
  ContributionMode,
} from '../../../domain/household/household';

export class CreateHouseholdDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  netMonthlyIncomeCents?: number | null;
}

export class JoinHouseholdDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  code!: string;
}

export class SetIncomeDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  netMonthlyIncomeCents!: number | null;
}

export class SetContributionModeDto {
  @IsEnum(CONTRIBUTION_MODES)
  mode!: ContributionMode;
}

export class RecordContributionPaymentDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month doit être au format AAAA-MM',
  })
  month!: string;

  @IsInt({ message: 'amountCents doit être un entier de centimes' })
  @Min(1, { message: 'amountCents doit être strictement positif' })
  amountCents!: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'date invalide' })
  date?: Date;

  @IsOptional()
  @IsString({ message: 'accountId doit être un identifiant de compte' })
  @MaxLength(100, { message: 'accountId est trop long' })
  accountId?: string | null;

  @IsOptional()
  @IsBoolean({ message: 'debitPersonal doit être un booléen' })
  debitPersonal?: boolean;

  @IsOptional()
  @IsString({
    message: 'personalAccountId doit être un identifiant de compte',
  })
  @MaxLength(100, { message: 'personalAccountId est trop long' })
  personalAccountId?: string | null;

  @IsOptional()
  @IsEnum(BLOCS, {
    message: `personalBloc doit être l'un de : ${BLOCS.join(', ')}`,
  })
  personalBloc?: Bloc;
}

export class ContributionStatusQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month doit être au format AAAA-MM',
  })
  month?: string;
}
