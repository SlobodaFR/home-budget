import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MAX_COMMIT_ITEMS } from '../../../application/import/import.use-cases';
import { BLOCS, Bloc } from '../../../domain/shared/bloc';
import { TransactionKind } from '../../../domain/transaction/transaction';

export class PreviewImportDto {
  @IsString()
  @MaxLength(1_000_000)
  text!: string;

  @IsOptional()
  @IsString({ message: 'accountId doit être un identifiant de compte ou null' })
  @MaxLength(100, { message: 'accountId est trop long' })
  accountId?: string | null;
}

export class CommitItemDto {
  @IsEnum(['INCOME', 'EXPENSE'])
  kind!: TransactionKind;

  @ValidateIf((o: CommitItemDto) => o.kind === 'EXPENSE')
  @IsEnum(BLOCS)
  bloc?: Bloc;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label!: string;

  @IsInt()
  @Min(1)
  amountCents!: number;

  @Type(() => Date)
  @IsDate()
  date!: Date;
}

export class CommitImportDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_COMMIT_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CommitItemDto)
  items!: CommitItemDto[];

  @IsOptional()
  @IsString({ message: 'accountId doit être un identifiant de compte ou null' })
  @MaxLength(100, { message: 'accountId est trop long' })
  accountId?: string | null;
}

export class RuleDto {
  @IsString()
  @MaxLength(100)
  keyword!: string;

  @IsString()
  target!: string;
}

export class SaveRulesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleDto)
  rules!: RuleDto[];
}
