import { Money } from '../shared/money';
import { AccountType } from './account-type.enum';

export interface AccountProps {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  icon: string;
  monthlyBudget: Money | null;
}

/**
 * Account is an aggregate root. Its balance is derived from the sum of its
 * transactions and is therefore never stored on the entity itself.
 */
export class Account {
  private constructor(private readonly props: AccountProps) {
    if (!props.name.trim()) {
      throw new Error('Account name must not be empty');
    }
    if (props.type === AccountType.EXPENSE && props.monthlyBudget === null) {
      throw new Error('Expense accounts must define a monthly budget');
    }
    if (props.type === AccountType.SOURCE && props.monthlyBudget !== null) {
      throw new Error('Source accounts must not define a monthly budget');
    }
  }

  static create(props: AccountProps): Account {
    return new Account(props);
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get name(): string {
    return this.props.name;
  }

  get type(): AccountType {
    return this.props.type;
  }

  get icon(): string {
    return this.props.icon;
  }

  get monthlyBudget(): Money | null {
    return this.props.monthlyBudget;
  }

  isSource(): boolean {
    return this.props.type === AccountType.SOURCE;
  }
}
