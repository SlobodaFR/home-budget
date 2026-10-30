import { DomainError } from '../shared/domain-error';

export type MembershipRole = 'OWNER' | 'MEMBER';

export interface MembershipProps {
  householdId: string;
  userId: string;
  role: MembershipRole;
  /** Revenu net mensuel declare par le membre, en centimes (sert a la contribution). */
  netMonthlyIncomeCents: number | null;
  joinedAt: Date;
}

export class Membership {
  private constructor(private readonly props: MembershipProps) {
    const income = props.netMonthlyIncomeCents;
    if (income !== null && (!Number.isInteger(income) || income < 0)) {
      throw new DomainError('Le revenu doit etre un entier positif ou nul');
    }
  }

  static create(props: MembershipProps): Membership {
    return new Membership(props);
  }

  get householdId(): string {
    return this.props.householdId;
  }

  get userId(): string {
    return this.props.userId;
  }

  get role(): MembershipRole {
    return this.props.role;
  }

  get netMonthlyIncomeCents(): number | null {
    return this.props.netMonthlyIncomeCents;
  }

  get joinedAt(): Date {
    return this.props.joinedAt;
  }

  withIncome(netMonthlyIncomeCents: number | null): Membership {
    return new Membership({ ...this.props, netMonthlyIncomeCents });
  }
}
