export interface UserProps {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
  createdAt: Date;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * User is a local mirror of the profile held by the central auth service
 * (auth.sloboda.fr), upserted on each OAuth2 callback. Accounts are scoped
 * to a single user via Account.userId (= the auth service's `sub`).
 */
export class User {
  private readonly props: UserProps;

  private constructor(props: UserProps) {
    const email = props.email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      throw new Error('Invalid email address');
    }
    this.props = { ...props, email };
  }

  static create(props: UserProps): User {
    return new User(props);
  }

  get id(): string {
    return this.props.id;
  }

  get email(): string {
    return this.props.email;
  }

  get name(): string {
    return this.props.name;
  }

  get avatarUrl(): string {
    return this.props.avatarUrl;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** Returns a copy with the profile fields refreshed from the auth service. */
  withProfile(profile: {
    email: string;
    name: string;
    avatarUrl: string;
  }): User {
    return new User({
      ...this.props,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    });
  }
}
