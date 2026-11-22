import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { ConfigService } from '@nestjs/config';
import { exportJWK, generateKeyPair, JWK, KeyLike, SignJWT } from 'jose';
import { FeatureFlags } from '../../domain/shared/feature-flags';
import { JwksAccessTokenVerifier } from './jwks-access-token-verifier';

const FLAG = 'auth-verify-token-claims';
const CLIENT_ID = 'budget-client';

class FakeFlags extends FeatureFlags {
  enabled = false;
  readonly asked: [string, boolean][] = [];
  async isEnabled(key: string, codeDefault: boolean): Promise<boolean> {
    this.asked.push([key, codeDefault]);
    return key === FLAG ? this.enabled : codeDefault;
  }
}

describe('JwksAccessTokenVerifier', () => {
  let server: Server;
  let origin: string;
  let privateKey: KeyLike;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    privateKey = pair.privateKey;
    const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: 'k1' };
    // PS256 et RS256 partagent la même clé RSA : l'ensemble JWKS n'impose aucun algorithme.
    server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        req.url === '/.well-known/jwks.json'
          ? JSON.stringify({ keys: [jwk] })
          : '{}',
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  function verifier(flags: FeatureFlags, authServiceUrl = origin) {
    const config = new ConfigService({
      AUTH_SERVICE_URL: authServiceUrl,
      AUTH_CLIENT_ID: CLIENT_ID,
    });
    return new JwksAccessTokenVerifier(config, flags);
  }

  function token(
    claims: { aud?: string | string[]; iss?: string; alg?: string } = {},
  ): Promise<string> {
    const jwt = new SignJWT({ email: 'a@b.test', name: 'Alice' })
      .setProtectedHeader({ alg: claims.alg ?? 'RS256', kid: 'k1' })
      .setSubject('user-1')
      .setIssuedAt()
      .setExpirationTime('5m');
    const aud = 'aud' in claims ? claims.aud : CLIENT_ID;
    if (aud !== undefined) jwt.setAudience(aud);
    const iss = 'iss' in claims ? claims.iss : origin;
    if (iss !== undefined) jwt.setIssuer(iss);
    return jwt.sign(privateKey);
  }

  describe(`${FLAG} désactivé (comportement actuel)`, () => {
    it('lit le flag avec false comme défaut du code', async () => {
      const flags = new FakeFlags();
      await verifier(flags).verify(await token());
      expect(flags.asked).toEqual([[FLAG, false]]);
    });

    it('accepte un jeton valide', async () => {
      const result = await verifier(new FakeFlags()).verify(await token());
      expect(result).toMatchObject({
        sub: 'user-1',
        email: 'a@b.test',
        name: 'Alice',
      });
    });

    it('ne contrôle ni audience, ni émetteur, ni algorithme', async () => {
      const v = verifier(new FakeFlags());
      expect(
        await v.verify(await token({ aud: 'une-autre-app' })),
      ).not.toBeNull();
      expect(
        await v.verify(await token({ iss: 'https://evil.example' })),
      ).not.toBeNull();
      expect(
        await v.verify(await token({ aud: undefined, iss: undefined })),
      ).not.toBeNull();
      expect(await v.verify(await token({ alg: 'PS256' }))).not.toBeNull();
    });

    it('rejette toujours un jeton signé par une autre clé', async () => {
      const other = await generateKeyPair('RS256');
      const forged = await new SignJWT({ email: 'a@b.test', name: 'Alice' })
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setSubject('user-1')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(other.privateKey);
      expect(await verifier(new FakeFlags()).verify(forged)).toBeNull();
    });
  });

  describe(`${FLAG} activé`, () => {
    function strict(authServiceUrl?: string) {
      const flags = new FakeFlags();
      flags.enabled = true;
      return verifier(flags, authServiceUrl);
    }

    it('accepte un jeton valide (audience, émetteur, RS256)', async () => {
      const result = await strict().verify(await token());
      expect(result).toMatchObject({ sub: 'user-1', name: 'Alice' });
    });

    it('rejette l’audience d’une autre app', async () => {
      expect(
        await strict().verify(await token({ aud: 'une-autre-app' })),
      ).toBeNull();
    });

    it('rejette une audience absente', async () => {
      expect(await strict().verify(await token({ aud: undefined }))).toBeNull();
    });

    it('rejette un émetteur faux ou absent', async () => {
      const v = strict();
      expect(
        await v.verify(await token({ iss: 'https://evil.example' })),
      ).toBeNull();
      expect(await v.verify(await token({ iss: undefined }))).toBeNull();
    });

    it('rejette un algorithme autre que RS256', async () => {
      expect(await strict().verify(await token({ alg: 'PS256' }))).toBeNull();
    });

    it('compare l’émetteur à l’origine de AUTH_SERVICE_URL (sans chemin ni slash final)', async () => {
      const v = strict(`${origin}/`);
      expect(await v.verify(await token())).not.toBeNull();
      expect(await v.verify(await token({ iss: `${origin}/` }))).toBeNull();
    });
  });

  it('suit le flag à chaud, sans redémarrage', async () => {
    const flags = new FakeFlags();
    const v = verifier(flags);
    const foreign = await token({ aud: 'une-autre-app' });
    expect(await v.verify(foreign)).not.toBeNull();
    flags.enabled = true;
    expect(await v.verify(foreign)).toBeNull();
    flags.enabled = false;
    expect(await v.verify(foreign)).not.toBeNull();
  });
});
