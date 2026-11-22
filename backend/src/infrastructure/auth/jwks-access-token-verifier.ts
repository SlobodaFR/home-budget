import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createRemoteJWKSet,
  jwtVerify,
  JWTPayload,
  JWTVerifyOptions,
} from 'jose';
import { AccessTokenPayload } from '../../domain/auth/access-token-payload';
import { AccessTokenVerifier } from '../../domain/auth/access-token-verifier';
import { FeatureFlags } from '../../domain/shared/feature-flags';

interface AuthServiceJwtPayload extends JWTPayload {
  email?: string;
  name?: string;
}

/** Flag home-features : vérifie audience, émetteur et algorithme (RS256). Défaut du code : désactivé. */
export const VERIFY_TOKEN_CLAIMS_FLAG = 'auth-verify-token-claims';

/** Verifies RS256 access tokens issued by auth.sloboda.fr against its JWKS. */
@Injectable()
export class JwksAccessTokenVerifier extends AccessTokenVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly strictOptions: JWTVerifyOptions;

  constructor(
    config: ConfigService,
    private readonly flags: FeatureFlags,
  ) {
    super();
    const authServiceUrl = config.getOrThrow<string>('AUTH_SERVICE_URL');
    this.jwks = createRemoteJWKSet(
      new URL('/.well-known/jwks.json', authServiceUrl),
    );
    this.strictOptions = {
      audience: config.getOrThrow<string>('AUTH_CLIENT_ID'),
      issuer: new URL(authServiceUrl).origin,
      algorithms: ['RS256'],
    };
  }

  async verify(token: string): Promise<AccessTokenPayload | null> {
    try {
      // Évaluation non bloquante (mémo de l'adaptateur) : désactivé tant que home-features ne dit pas le contraire.
      const strict = await this.flags.isEnabled(
        VERIFY_TOKEN_CLAIMS_FLAG,
        false,
      );
      const { payload } = await jwtVerify<AuthServiceJwtPayload>(
        token,
        this.jwks,
        strict ? this.strictOptions : undefined,
      );
      if (!payload.sub || !payload.email || !payload.name || !payload.iat) {
        return null;
      }
      return {
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        issuedAt: new Date(payload.iat * 1000),
      };
    } catch {
      return null;
    }
  }
}
