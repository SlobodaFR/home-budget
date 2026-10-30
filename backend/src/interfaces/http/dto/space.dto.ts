import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { BLOCS, Bloc } from '../../../domain/shared/bloc';
import { TransactionKind } from '../../../domain/transaction/transaction';

export class MonthQueryDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month doit etre au format AAAA-MM',
  })
  month!: string;
}

export class SavePlanDto {
  @IsInt() @Min(0) incomeCents!: number;
  @IsInt() @Min(0) fixeCents!: number;
  @IsInt() @Min(0) courantCents!: number;
  @IsInt() @Min(0) plaisirCents!: number;
  @IsInt() @Min(0) epargneCents!: number;
}

export class SaveTransactionDto {
  @IsEnum(['INCOME', 'EXPENSE'])
  kind!: TransactionKind;

  @ValidateIf((o: SaveTransactionDto) => o.kind === 'EXPENSE')
  @IsEnum(BLOCS)
  bloc?: Bloc;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label!: string;

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;
}
