import { randomUUID } from 'node:crypto';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp, nestApplicationOptions } from '../configure-app';
import { RevokedSessionRepository } from '../domain/auth/revoked-session.repository';
import { computeWebhookSignature } from '../domain/auth/webhook-signature';

const SIGNING_SECRET =
  '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const LEGACY_SECRET = 'ancien-secret-de-query';

describe('Webhook de déconnexion signé (AppModule réel, AUTH_MODE=dev)', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  async function boot(
    options: { signingSecret?: string; requireSignature?: boolean } = {},
  ): Promise<NestExpressApplication> {
    Object.assign(process.env, {
      AUTH_MODE: 'dev',
      NODE_ENV: 'test',
      DATABASE_PATH: ':memory:',
      FRONTEND_URL: 'http://localhost:3000',
      AUTH_WEBHOOK_SECRET: LEGACY_SECRET,
    });
    delete process.env.PERSONAL_DATA_KEY;
    delete process.env.FEATURES_OFREP_URL;
    delete process.env.FEATURES_API_KEY;
    delete process.env.FEATURES_PIN_AUTH_WEBHOOK_REQUIRE_SIGNATURE;
    delete process.env.AUTH_WEBHOOK_SIGNING_SECRET;
    if (options.signingSecret)
      process.env.AUTH_WEBHOOK_SIGNING_SECRET = options.signingSecret;
    if (options.requireSignature)
      process.env.FEATURES_PIN_AUTH_WEBHOOK_REQUIRE_SIGNATURE = 'true';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>(
      nestApplicationOptions,
    );
    configureApp(app);
    await app.init();
    return app;
  }

  /** Appel de home-auth : corps JSON exact, en-têtes de signature, aucun en-tête de navigateur. */
  function deliver(
    app: NestExpressApplication,
    rawBody: string,
    options: {
      id?: string;
      timestamp?: number;
      secret?: string;
      query?: string;
      sign?: boolean;
    } = {},
  ) {
    const id = options.id ?? randomUUID();
    const timestamp = String(
      options.timestamp ?? Math.floor(Date.now() / 1000),
    );
    const req = request(app.getHttpServer())
      .post(`/api/auth/disconnect${options.query ?? ''}`)
      .set('Content-Type', 'application/json');
    if (options.sign !== false)
      req
        .set('X-Auth-Webhook-Id', id)
        .set('X-Auth-Webhook-Timestamp', timestamp)
        .set(
          'X-Auth-Webhook-Signature',
          `v1=${computeWebhookSignature(options.secret ?? SIGNING_SECRET, id, timestamp, rawBody)}`,
        );
    return req.send(rawBody);
  }

  async function isRevoked(
    app: NestExpressApplication,
    userId: string,
  ): Promise<boolean> {
    return (
      (await app.get(RevokedSessionRepository).getRevokedAt(userId)) !== null
    );
  }

  it('accepte une requête signée sans ?secret= et révoque les sessions de l’utilisateur', async () => {
    const app = await boot({ signingSecret: SIGNING_SECRET });
    try {
      await deliver(app, '{"userId":"alice"}').expect(204);
      expect(await isRevoked(app, 'alice')).toBe(true);
      expect(await isRevoked(app, 'bob')).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('vérifie les octets reçus : un corps formaté autrement, signé tel quel, passe ; modifié, il est refusé', async () => {
    const app = await boot({ signingSecret: SIGNING_SECRET });
    try {
      const spaced = '{ "userId" : "alice" }';
      await deliver(app, spaced).expect(204);

      const id = randomUUID();
      const timestamp = String(Math.floor(Date.now() / 1000));
      await request(app.getHttpServer())
        .post('/api/auth/disconnect')
        .set('Content-Type', 'application/json')
        .set('X-Auth-Webhook-Id', id)
        .set('X-Auth-Webhook-Timestamp', timestamp)
        .set(
          'X-Auth-Webhook-Signature',
          `v1=${computeWebhookSignature(SIGNING_SECRET, id, timestamp, '{"userId":"bob"}')}`,
        )
        .send('{"userId":"mallory"}')
        .expect(401);
      expect(await isRevoked(app, 'mallory')).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('refuse une signature d’un autre secret, un horodatage périmé et un rejeu', async () => {
    const app = await boot({ signingSecret: SIGNING_SECRET });
    try {
      const body = '{"userId":"alice"}';
      await deliver(app, body, { secret: 'f'.repeat(64) }).expect(401);
      await deliver(app, body, {
        timestamp: Math.floor(Date.now() / 1000) - 3600,
      }).expect(401);
      const id = randomUUID();
      await deliver(app, body, { id }).expect(204);
      await deliver(app, body, { id }).expect(401);
    } finally {
      await app.close();
    }
  });

  it('refuse le rejeu d’un identifiant signé même avec un ?secret= valide', async () => {
    const app = await boot({ signingSecret: SIGNING_SECRET });
    try {
      const body = '{"userId":"alice"}';
      const id = randomUUID();
      await deliver(app, body, { id }).expect(204);
      await deliver(app, body, {
        id,
        query: `?secret=${LEGACY_SECRET}`,
      }).expect(401);
    } finally {
      await app.close();
    }
  });

  it('accepte aussi l’ancien ?secret= tant que la signature n’est pas obligatoire', async () => {
    const app = await boot({ signingSecret: SIGNING_SECRET });
    try {
      const body = '{"userId":"alice"}';
      await deliver(app, body, {
        sign: false,
        query: `?secret=${LEGACY_SECRET}`,
      }).expect(204);
      await deliver(app, body, { sign: false, query: '?secret=faux' }).expect(
        401,
      );
      await deliver(app, body, { sign: false }).expect(401);
    } finally {
      await app.close();
    }
  });

  it('sans AUTH_WEBHOOK_SIGNING_SECRET, seul l’ancien chemin existe', async () => {
    const app = await boot();
    try {
      const body = '{"userId":"alice"}';
      await deliver(app, body).expect(401);
      await deliver(app, body, { query: `?secret=${LEGACY_SECRET}` }).expect(
        204,
      );
    } finally {
      await app.close();
    }
  });

  it('flag auth-webhook-require-signature actif (pin) : signature obligatoire, ?secret= refusé', async () => {
    const app = await boot({
      signingSecret: SIGNING_SECRET,
      requireSignature: true,
    });
    try {
      const body = '{"userId":"alice"}';
      await deliver(app, body).expect(204);
      await deliver(app, body, {
        sign: false,
        query: `?secret=${LEGACY_SECRET}`,
      }).expect(401);
      await deliver(app, body, {
        secret: 'f'.repeat(64),
        query: `?secret=${LEGACY_SECRET}`,
      }).expect(401);
    } finally {
      await app.close();
    }
  });

  it('refuse un corps qui n’est pas {userId} même correctement signé', async () => {
    const app = await boot({ signingSecret: SIGNING_SECRET });
    try {
      await deliver(app, '{}').expect(400);
    } finally {
      await app.close();
    }
  });
});
