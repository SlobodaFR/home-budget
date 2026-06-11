import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  NotEquals,
} from 'class-validator';
import {
  TRANSACTION_CATEGORIES,
  TransactionCategory,
} from '../../../domain/transaction/transaction-category';

export class SaveTransactionDto {
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
  @IsString()
  date?: string;
}
