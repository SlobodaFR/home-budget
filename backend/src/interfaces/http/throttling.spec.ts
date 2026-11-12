import { Controller, Get } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import {
  THROTTLE_ERROR_MESSAGE,
  THROTTLE_LIMIT,
  throttlerOptions,
} from './throttling';

@Controller('api')
class StubController {
  @Get('ping')
  ping(): string {
    return 'pong';
  }

  @Get('other')
  other(): string {
    return 'other';
  }
}

describe('rate limiting (HTTP)', () => {
  let app: NestExpressApplication;

  async function createApp(): Promise<NestExpressApplication> {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot(throttlerOptions)],
      controllers: [StubController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();
    const nestApp = moduleRef.createNestApplication<NestExpressApplication>();
    // Comme configure-app.ts : un seul saut de proxy (Caddy) derrière lequel X-Forwarded-For est fiable.
    nestApp.set('trust proxy', 1);
    await nestApp.init();
    return nestApp;
  }

  afterEach(async () => {
    await app.close();
  });

  const ping = (ip: string) =>
    request(app.getHttpServer()).get('/api/ping').set('X-Forwarded-For', ip);

  async function exhaust(ip: (i: number) => string) {
    for (let i = 0; i < THROTTLE_LIMIT; i++) await ping(ip(i)).expect(200);
  }

  it('should answer 429 with a French message once one IP spends its budget', async () => {
    app = await createApp();
    await exhaust(() => '203.0.113.1');

    const blocked = await ping('203.0.113.1').expect(429);
    expect(blocked.body).toMatchObject({
      statusCode: 429,
      message: THROTTLE_ERROR_MESSAGE,
    });
    expect(blocked.headers['retry-after']).toBeDefined();
    await ping('203.0.113.2').expect(200);
  });

  it('should group IPv6 clients by /64', async () => {
    app = await createApp();
    await exhaust((i) => `2001:db8:1:2::${i.toString(16)}`);

    expect((await ping('2001:db8:1:2:ffff::1')).status).toBe(429);
    expect((await ping('2001:db8:1:3::1')).status).toBe(200);
  });

  it('should keep a separate budget per route', async () => {
    app = await createApp();
    await exhaust(() => '203.0.113.1');

    const other = await request(app.getHttpServer())
      .get('/api/other')
      .set('X-Forwarded-For', '203.0.113.1');
    expect(other.status).toBe(200);
  });

  it('should key on the address added by Caddy, not on a spoofed X-Forwarded-For', async () => {
    app = await createApp();
    // Caddy ajoute l'adresse réelle à la fin de ce que le client a envoyé.
    await exhaust((i) => `198.51.100.${String(i)}, 203.0.113.9`);

    expect((await ping('198.51.100.250, 203.0.113.9')).status).toBe(429);
  });
});
