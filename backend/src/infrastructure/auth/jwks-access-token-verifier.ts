import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { AccessTokenPayload } from '../../domain/auth/access-token-payload';
import { AccessTokenVerifier } from '../../domain/auth/access-token-verifier';

interface AuthServiceJwtPayload extends JWTPayload {
  email?: string;
  name?: string;
}

/** Verifies RS256 access tokens issued by auth.sloboda.fr against its JWKS. */
@Injectable()
export class JwksAccessTokenVerifier extends AccessTokenVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly config: ConfigService) {
    super();
    const authServiceUrl = this.config.getOrThrow<string>('AUTH_SERVICE_URL');
    this.jwks = createRemoteJWKSet(
      new URL('/.well-known/jwks.json', authServiceUrl),
    );
  }

  async verify(token: string): Promise<AccessTokenPayload | null> {
    try {
      const { payload } = await jwtVerify<AuthServiceJwtPayload>(
        token,
        this.jwks,
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
