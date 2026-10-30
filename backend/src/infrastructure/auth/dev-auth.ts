import { ConfigService } from '@nestjs/config';
import { jwtVerify, SignJWT } from 'jose';
import { AccessTokenPayload } from '../../domain/auth/access-token-payload';
import { AccessTokenVerifier } from '../../domain/auth/access-token-verifier';
import {
  OAuthClient,
  TokenPair,
  UserProfile,
} from '../../domain/auth/oauth-client';

export const DEV_USERS = ['alice', 'bob'];
const DEV_TOKEN_TTL_SECONDS = 8 * 60 * 60;

function secretOf(config: ConfigService): Uint8Array {
  return new TextEncoder().encode(
    config.get<string>(
      'DEV_AUTH_SECRET',
      'dev-only-secret-not-for-production-use',
    ),
  );
}

export async function signDevAccessToken(
  config: ConfigService,
  user: { id: string; email: string; name: string },
): Promise<{ token: string; expiresIn: number }> {
  const token = await new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${DEV_TOKEN_TTL_SECONDS}s`)
    .sign(secretOf(config));
  return { token, expiresIn: DEV_TOKEN_TTL_SECONDS };
}

/** Verifie les jetons signes localement par la connexion de dev (HS256). */
export class DevAccessTokenVerifier extends AccessTokenVerifier {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async verify(token: string): Promise<AccessTokenPayload | null> {
    try {
      const { payload } = await jwtVerify(token, secretOf(this.config), {
        algorithms: ['HS256'],
      });
      if (!payload.sub || !payload.iat) return null;
      return {
        sub: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : '',
        name: typeof payload.name === 'string' ? payload.name : payload.sub,
        issuedAt: new Date(payload.iat * 1000),
      };
    } catch {
      return null;
    }
  }
}

/** En mode dev il n'y a pas de service d'authentification a joindre. */
export class UnavailableOAuthClient extends OAuthClient {
  authorizeUrl(): string {
    throw new Error('OAuth indisponible en mode dev');
  }
  exchangeCode(): Promise<TokenPair> {
    return Promise.reject(new Error('OAuth indisponible en mode dev'));
  }
  refresh(): Promise<TokenPair> {
    return Promise.reject(new Error('OAuth indisponible en mode dev'));
  }
  fetchUserInfo(): Promise<UserProfile> {
    return Promise.reject(new Error('OAuth indisponible en mode dev'));
  }
}
