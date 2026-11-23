import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { exportJWK, generateKeyPair, KeyLike, SignJWT } from 'jose';
import request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { AccessTokenVerifier } from '../domain/auth/access-token-verifier';
import { JwksAccessTokenVerifier } from '../infrastructure/auth/jwks-access-token-verifier';
import { ACCESS_TOKEN_COOKIE_NAME } from '../interfaces/http/auth-session';

const CLIENT_ID = 'budget-client';

describe('Vérification des claims des access tokens (AppModule réel, AUTH_MODE=oauth)', () => {
  const env = { ...process.env };
  let jwks: Server;
  let origin: string;
  let privateKey: KeyLike;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    privateKey = pair.privateKey;
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1' };
    jwks = createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((resolve) => jwks.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(jwks.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => jwks.close(() => resolve()));
  });
  afterEach(() => {
    process.env = { ...env };
  });

  async function boot(pin?: 'true' | 'false'): Promise<NestExpressApplication> {
    Object.assign(process.env, {
      AUTH_MODE: 'oauth',
      NODE_ENV: 'test',
      DATABASE_PATH: ':memory:',
      FRONTEND_URL: 'http://localhost:3000',
      AUTH_SERVICE_URL: origin,
      AUTH_CLIENT_ID: CLIENT_ID,
      AUTH_CLIENT_SECRET: 'test-secret',
      AUTH_WEBHOOK_SECRET: 'test-webhook-secret',
    });
    delete process.env.PERSONAL_DATA_KEY;
    delete process.env.FEATURES_OFREP_URL;
    delete process.env.FEATURES_API_KEY;
    delete process.env.FEATURES_PIN_AUTH_VERIFY_TOKEN_CLAIMS;
    if (pin) process.env.FEATURES_PIN_AUTH_VERIFY_TOKEN_CLAIMS = pin;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    return app;
  }

  function token(audience: string): Promise<string> {
    return new SignJWT({ email: 'a@b.test', name: 'Alice' })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setSubject('user-1')
      .setIssuedAt()
      .setIssuer(origin)
      .setAudience(audience)
      .setExpirationTime('5m')
      .sign(privateKey);
  }

  async function status(
    app: NestExpressApplication,
    accessToken: string,
  ): Promise<number> {
    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `${ACCESS_TOKEN_COOKIE_NAME}=${accessToken}`);
    return res.status;
  }

  it('branche le vérificateur JWKS sur les flags : sans flag ni pin, une autre audience passe (comportement actuel)', async () => {
    const app = await boot();
    try {
      expect(app.get(AccessTokenVerifier)).toBeInstanceOf(
        JwksAccessTokenVerifier,
      );
      expect(await status(app, await token(CLIENT_ID))).toBe(200);
      expect(await status(app, await token('une-autre-app'))).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('flag actif (pin d’urgence) : l’audience d’une autre app est rejetée, un jeton valide passe', async () => {
    const app = await boot('true');
    try {
      expect(await status(app, await token(CLIENT_ID))).toBe(200);
      expect(await status(app, await token('une-autre-app'))).toBe(401);
    } finally {
      await app.close();
    }
  });
});
