export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
}

/**
 * Port (driven side) implemented by the infrastructure layer. Talks to the
 * central auth service (auth.sloboda.fr) using the OAuth2 Authorization Code
 * flow.
 */
export abstract class OAuthClient {
  abstract authorizeUrl(redirectUri: string): string;
  abstract exchangeCode(code: string, redirectUri: string): Promise<TokenPair>;
  abstract refresh(refreshToken: string): Promise<TokenPair>;
  abstract fetchUserInfo(accessToken: string): Promise<UserProfile>;
}
