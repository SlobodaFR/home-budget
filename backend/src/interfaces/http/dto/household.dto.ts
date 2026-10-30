import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
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
