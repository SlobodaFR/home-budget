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
} from 'class-validator';
import {
  ACCOUNT_KINDS,
  AccountKind,
  MAX_ACCOUNT_NAME_LENGTH,
  MAX_OPENING_BALANCE_CENTS,
} from '../../../domain/account/account';

export class CreateAccountDto {
  @IsString({ message: 'name doit être un texte' })
  @IsNotEmpty({ message: 'name ne doit pas être vide' })
  @MaxLength(MAX_ACCOUNT_NAME_LENGTH, {
    message: `name est trop long (${MAX_ACCOUNT_NAME_LENGTH} caractères au plus)`,
  })
  name!: string;

  @IsIn(ACCOUNT_KINDS, {
    message: 'kind doit être CHECKING, SAVINGS ou CASH',
  })
  kind!: AccountKind;

  @IsInt({ message: 'openingBalanceCents doit être un entier (en centimes)' })
  @Min(-MAX_OPENING_BALANCE_CENTS, {
    message: 'openingBalanceCents est trop bas',
  })
  @Max(MAX_OPENING_BALANCE_CENTS, {
    message: 'openingBalanceCents est trop élevé',
  })
  openingBalanceCents!: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'openingDate doit être au format AAAA-MM-JJ',
  })
  openingDate!: string;
}

export class UpdateAccountDto extends CreateAccountDto {
  @IsOptional()
  @IsBoolean({ message: 'archived doit être vrai ou faux' })
  archived?: boolean;
}
