import { AccessTokenPayload } from './access-token-payload';

/**
 * Port (driven side) implemented by the infrastructure layer. Verifies
 * access tokens issued by the central auth service (RS256 / JWKS).
 */
export abstract class AccessTokenVerifier {
  abstract verify(token: string): Promise<AccessTokenPayload | null>;
}
