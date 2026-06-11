import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { AccountType } from '../../../domain/account/account-type.enum';

export class SaveAccountDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(AccountType)
  type!: AccountType;

  @IsString()
  @IsNotEmpty()
  icon!: string;

  /**
   * Required for EXPENSE accounts, must be omitted/null for SOURCE accounts.
   * The domain entity enforces this invariant.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyBudgetCents?: number | null;
}
