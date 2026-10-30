import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import {
  DEFAULT_TREND_MONTHS,
  MAX_TREND_MONTHS,
  MIN_TREND_MONTHS,
} from '../../../domain/trend/trends';

export class TrendsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({
    message: `months doit être un entier de ${MIN_TREND_MONTHS} à ${MAX_TREND_MONTHS}`,
  })
  @Min(MIN_TREND_MONTHS, {
    message: `months doit être compris entre ${MIN_TREND_MONTHS} et ${MAX_TREND_MONTHS}`,
  })
  @Max(MAX_TREND_MONTHS, {
    message: `months doit être compris entre ${MIN_TREND_MONTHS} et ${MAX_TREND_MONTHS}`,
  })
  months: number = DEFAULT_TREND_MONTHS;

  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'to doit être au format AAAA-MM',
  })
  to?: string;
}
