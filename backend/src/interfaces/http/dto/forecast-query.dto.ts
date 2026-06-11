import { IsString, IsNotEmpty } from 'class-validator';

export class ForecastQueryDto {
  @IsString()
  @IsNotEmpty()
  date!: string;
}
