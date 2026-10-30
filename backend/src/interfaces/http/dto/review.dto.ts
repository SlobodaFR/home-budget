import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_ANSWER_LENGTH } from '../../../domain/review/month-review';

const tooLong = (field: string) => ({
  message: `${field} est trop long (${MAX_ANSWER_LENGTH} caractères au plus)`,
});

export class ReviewAnswersDto {
  @IsOptional()
  @IsString({ message: 'wentWell doit être un texte' })
  @MaxLength(MAX_ANSWER_LENGTH, tooLong('wentWell'))
  wentWell?: string;

  @IsOptional()
  @IsString({ message: 'surprise doit être un texte' })
  @MaxLength(MAX_ANSWER_LENGTH, tooLong('surprise'))
  surprise?: string;

  @IsOptional()
  @IsString({ message: 'decision doit être un texte' })
  @MaxLength(MAX_ANSWER_LENGTH, tooLong('decision'))
  decision?: string;
}

export class SaveReviewDto {
  @IsObject({ message: 'answers doit être un objet' })
  @ValidateNested()
  @Type(() => ReviewAnswersDto)
  answers!: ReviewAnswersDto;

  @IsBoolean({ message: 'complete doit être vrai ou faux' })
  complete!: boolean;
}

export class ReviewMonthParamDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month doit être au format AAAA-MM',
  })
  month!: string;
}

export class ReviewsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit doit être un entier de 1 à 120' })
  @Min(1, { message: 'limit doit être compris entre 1 et 120' })
  @Max(120, { message: 'limit doit être compris entre 1 et 120' })
  limit?: number;
}

export class TransactionsExportQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'from doit être au format AAAA-MM-JJ',
  })
  from!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'to doit être au format AAAA-MM-JJ',
  })
  to!: string;
}
