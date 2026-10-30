import { DomainError } from '../shared/domain-error';

export const INVITATION_TTL_DAYS = 7;

export interface InvitationProps {
  code: string;
  householdId: string;
  createdBy: string;
  expiresAt: Date;
  usedAt: Date | null;
  usedBy: string | null;
}

/** Invitation a usage unique pour rejoindre un foyer. */
export class Invitation {
  private constructor(private readonly props: InvitationProps) {}

  static issue(
    props: { code: string; householdId: string; createdBy: string },
    now: Date,
  ): Invitation {
    const expiresAt = new Date(
      now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    return new Invitation({ ...props, expiresAt, usedAt: null, usedBy: null });
  }

  static restore(props: InvitationProps): Invitation {
    return new Invitation(props);
  }

  get code(): string {
    return this.props.code;
  }

  get householdId(): string {
    return this.props.householdId;
  }

  get createdBy(): string {
    return this.props.createdBy;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get usedAt(): Date | null {
    return this.props.usedAt;
  }

  get usedBy(): string | null {
    return this.props.usedBy;
  }

  isUsable(now: Date): boolean {
    return this.props.usedAt === null && now < this.props.expiresAt;
  }

  consume(userId: string, now: Date): Invitation {
    if (!this.isUsable(now)) {
      throw new DomainError('Invitation expiree ou deja utilisee');
    }
    return new Invitation({ ...this.props, usedAt: now, usedBy: userId });
  }
}
