import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  LIFE_EVENT_TYPES,
  LifeEventType,
} from '../../../domain/life-event/catalog';
import {
  MAX_LIFE_EVENT_LABEL_LENGTH,
  MAX_STEP_NOTE_LENGTH,
} from '../../../domain/life-event/life-event';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateLifeEventDto {
  @IsIn(LIFE_EVENT_TYPES, {
    message: `type doit être l'un de : ${LIFE_EVENT_TYPES.join(', ')}`,
  })
  type!: LifeEventType;

  @Matches(DATE_PATTERN, {
    message: 'eventDate doit être au format AAAA-MM-JJ',
  })
  eventDate!: string;

  @IsOptional()
  @IsString({ message: 'label doit être un texte' })
  @MaxLength(MAX_LIFE_EVENT_LABEL_LENGTH, {
    message: `label est trop long (${MAX_LIFE_EVENT_LABEL_LENGTH} caractères au plus)`,
  })
  label?: string;
}

export class UpdateLifeEventDto {
  @Matches(DATE_PATTERN, {
    message: 'eventDate doit être au format AAAA-MM-JJ',
  })
  eventDate!: string;

  @IsString({ message: 'label doit être un texte' })
  @IsNotEmpty({ message: 'label ne doit pas être vide' })
  @MaxLength(MAX_LIFE_EVENT_LABEL_LENGTH, {
    message: `label est trop long (${MAX_LIFE_EVENT_LABEL_LENGTH} caractères au plus)`,
  })
  label!: string;
}

export class SetLifeEventStepDto {
  @IsBoolean({ message: 'done doit être vrai ou faux' })
  done!: boolean;

  @IsOptional()
  @IsString({ message: 'note doit être un texte' })
  @MaxLength(MAX_STEP_NOTE_LENGTH, {
    message: `note est trop longue (${MAX_STEP_NOTE_LENGTH} caractères au plus)`,
  })
  note?: string;
}
