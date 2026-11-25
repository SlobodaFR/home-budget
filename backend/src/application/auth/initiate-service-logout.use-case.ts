import { AccessTokenVerifier } from '../../domain/auth/access-token-verifier';
import { OAuthClient } from '../../domain/auth/oauth-client';
import { FeatureFlags } from '../../domain/shared/feature-flags';

/**
 * home-features flag (this service's own, distinct from home-auth's flag of the same name): service-initiated
 * logout (contract PC10). Code default: false = local-only logout.
 */
export const RP_LOGOUT_FLAG = 'auth-rp-initiated-logout';

/** A home-auth outage must not turn the logout click into a hang. */
export const DEFAULT_REFRESH_TIMEOUT_MS = 3000;

export interface InitiateServiceLogoutInput {
  accessToken?: string;
  refreshToken?: string;
  /** Random value owned by the caller (it stores it and checks it on return). */
  state: string;
  postLogoutRedirectUri: string;
}

/**
 * Builds the home-auth logout URL (PC10) when the flag is on, else returns null (local-only logout).
 * The access token hint is the current access token if it verifies (signature + expiry, plus
 * audience/issuer when `auth-verify-token-claims` is on), else one obtained by refreshing; the
 * refreshed refresh token is discarded, never stored. Never throws: a failed or slow refresh only
 * means "no hint" (home-auth then asks for confirmation), never a logout signal.
 */
export class InitiateServiceLogoutUseCase {
  constructor(
    private readonly flags: FeatureFlags,
    private readonly verifier: AccessTokenVerifier,
    private readonly oauthClient: OAuthClient,
    private readonly refreshTimeoutMs = DEFAULT_REFRESH_TIMEOUT_MS,
  ) {}

  async execute(input: InitiateServiceLogoutInput): Promise<string | null> {
    if (!(await this.flags.isEnabled(RP_LOGOUT_FLAG, false))) {
      return null;
    }
    const accessTokenHint = await this.resolveHint(input);
    return this.oauthClient.logoutUrl({
      postLogoutRedirectUri: input.postLogoutRedirectUri,
      state: input.state,
      accessTokenHint,
    });
  }

  private async resolveHint(
    input: InitiateServiceLogoutInput,
  ): Promise<string | undefined> {
    if (input.accessToken && (await this.verifies(input.accessToken))) {
      return input.accessToken;
    }
    if (!input.refreshToken) {
      return undefined;
    }
    let timer: NodeJS.Timeout | undefined;
    try {
      const refreshed = await Promise.race([
        this.oauthClient.refresh(input.refreshToken),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('refresh timeout')),
            this.refreshTimeoutMs,
          );
        }),
      ]);
      return (await this.verifies(refreshed.accessToken))
        ? refreshed.accessToken
        : undefined;
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  private async verifies(token: string): Promise<boolean> {
    try {
      return (await this.verifier.verify(token)) !== null;
    } catch {
      return false;
    }
  }
}
