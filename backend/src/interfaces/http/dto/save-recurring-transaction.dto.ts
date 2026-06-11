import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  NotEquals,
} from 'class-validator';
import {
  TRANSACTION_CATEGORIES,
  TransactionCategory,
} from '../../../domain/transaction/transaction-category';

export class SaveRecurringTransactionDto {
  @IsUUID()
  accountId!: string;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsIn(TRANSACTION_CATEGORIES)
  category!: TransactionCategory;

  @IsInt()
  @NotEquals(0)
  amountCents!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number | null;

  @IsString()
  @IsNotEmpty()
  startDate!: string;

  @IsOptional()
  @IsString()
  endDate?: string | null;

  @IsBoolean()
  active!: boolean;
}
