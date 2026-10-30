import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  NotEquals,
} from 'class-validator';
import {
  MAX_PROJECT_CENTS,
  MAX_PROJECT_NAME_LENGTH,
  PROJECT_KINDS,
  ProjectKind,
} from '../../../domain/project/project';
import { MAX_NOTE_LENGTH } from '../../../domain/project/project-deposit';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateProjectDto {
  @IsString({ message: 'name doit être un texte' })
  @IsNotEmpty({ message: 'name ne doit pas être vide' })
  @MaxLength(MAX_PROJECT_NAME_LENGTH, {
    message: `name est trop long (${MAX_PROJECT_NAME_LENGTH} caractères au plus)`,
  })
  name!: string;

  @IsIn(PROJECT_KINDS, {
    message: `kind doit être ${PROJECT_KINDS.join(', ')}`,
  })
  kind!: ProjectKind;

  @IsInt({ message: 'targetCents doit être un entier (en centimes)' })
  @Min(1, { message: 'targetCents doit être strictement positif' })
  @Max(MAX_PROJECT_CENTS, { message: 'targetCents est trop élevé' })
  targetCents!: number;

  @Matches(DATE_PATTERN, {
    message: 'targetDate doit être au format AAAA-MM-JJ',
  })
  targetDate!: string;

  @IsInt({ message: 'startCents doit être un entier (en centimes)' })
  @Min(0, { message: 'startCents doit être positif ou nul' })
  @Max(MAX_PROJECT_CENTS, { message: 'startCents est trop élevé' })
  startCents!: number;

  @Matches(DATE_PATTERN, {
    message: 'startDate doit être au format AAAA-MM-JJ',
  })
  startDate!: string;

  @IsOptional()
  @IsString({ message: 'accountId doit être un identifiant de compte ou null' })
  @MaxLength(100, { message: 'accountId est trop long' })
  accountId?: string | null;
}

export class UpdateProjectDto extends CreateProjectDto {
  @IsOptional()
  @IsBoolean({ message: 'archived doit être vrai ou faux' })
  archived?: boolean;
}

export class AddDepositDto {
  @Matches(DATE_PATTERN, { message: 'date doit être au format AAAA-MM-JJ' })
  date!: string;

  @IsInt({ message: 'amountCents doit être un entier (en centimes)' })
  @NotEquals(0, { message: 'amountCents ne doit pas être nul' })
  @Min(-MAX_PROJECT_CENTS, { message: 'amountCents est trop bas' })
  @Max(MAX_PROJECT_CENTS, { message: 'amountCents est trop élevé' })
  amountCents!: number;

  @IsOptional()
  @IsString({ message: 'note doit être un texte' })
  @MaxLength(MAX_NOTE_LENGTH, {
    message: `note est trop longue (${MAX_NOTE_LENGTH} caractères au plus)`,
  })
  note?: string | null;
}
