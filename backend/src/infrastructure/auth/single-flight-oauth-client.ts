import { createHash } from 'node:crypto';
import {
  OAuthClient,
  TokenPair,
  UserProfile,
} from '../../domain/auth/oauth-client';

/**
 * Decorator that deduplicates concurrent `refresh(refreshToken)` calls: while
 * a refresh of a given token is in flight, every caller shares the same
 * promise (result or rejection). The entry is dropped as soon as the promise
 * settles, so nothing is cached: a later call hits upstream again.
 */
export class SingleFlightOAuthClient extends OAuthClient {
  private readonly inFlight = new Map<string, Promise<TokenPair>>();

  constructor(private readonly inner: OAuthClient) {
    super();
  }

  authorizeUrl(redirectUri: string): string {
    return this.inner.authorizeUrl(redirectUri);
  }

  logoutUrl(params: {
    postLogoutRedirectUri: string;
    state: string;
    accessTokenHint?: string;
  }): string {
    return this.inner.logoutUrl(params);
  }

  exchangeCode(code: string, redirectUri: string): Promise<TokenPair> {
    return this.inner.exchangeCode(code, redirectUri);
  }

  refresh(refreshToken: string): Promise<TokenPair> {
    const key = createHash('sha256').update(refreshToken).digest('hex');
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const promise = this.inner.refresh(refreshToken).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    return promise;
  }

  fetchUserInfo(accessToken: string): Promise<UserProfile> {
    return this.inner.fetchUserInfo(accessToken);
  }
}
