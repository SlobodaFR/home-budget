import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { VersionController } from './version.controller';

describe('GET /version', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [VersionController],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('answers the release version and the commit, never cached', async () => {
    vi.stubEnv('APP_VERSION', '0.7.3');
    vi.stubEnv('APP_COMMIT', 'b'.repeat(40));

    const response = await request(app.getHttpServer())
      .get('/version')
      .expect(200);

    expect(response.body).toEqual({ version: '0.7.3', commit: 'b'.repeat(40) });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it("answers 'dev' for an image not built by CI", async () => {
    vi.stubEnv('APP_VERSION', '');
    vi.stubEnv('APP_COMMIT', '');

    const response = await request(app.getHttpServer())
      .get('/version')
      .expect(200);

    expect(response.body).toEqual({ version: 'dev', commit: 'dev' });
  });

  it('is public (no session needed)', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, VersionController)).toBe(true);
  });
});
