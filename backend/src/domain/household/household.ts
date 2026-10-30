import { DomainError } from '../shared/domain-error';

export const CONTRIBUTION_MODES = [
  'EQUAL',
  'PROPORTIONAL',
  'EQUAL_REMAINDER',
] as const;
export type ContributionMode = (typeof CONTRIBUTION_MODES)[number];

export const MAX_HOUSEHOLD_MEMBERS = 4;

export interface HouseholdProps {
  id: string;
  name: string;
  contributionMode: ContributionMode;
  createdAt: Date;
}

/** Un foyer regroupe des membres, un espace commun et un espace personnel par membre. */
export class Household {
  private constructor(private readonly props: HouseholdProps) {
    if (!props.name.trim()) {
      throw new DomainError('Le nom du foyer ne doit pas etre vide');
    }
    if (props.name.trim().length > 60) {
      throw new DomainError('Le nom du foyer est trop long (60 caracteres)');
    }
  }

  static create(props: HouseholdProps): Household {
    return new Household({ ...props, name: props.name.trim() });
  }

  get id(): string {
    return this.props.id;
  }

  get name(): string {
    return this.props.name;
  }

  get contributionMode(): ContributionMode {
    return this.props.contributionMode;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  withContributionMode(mode: ContributionMode): Household {
    return new Household({ ...this.props, contributionMode: mode });
  }
}
