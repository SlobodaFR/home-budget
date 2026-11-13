import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Controller, Get } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { applySecurityHeaders } from './security-headers';

@Controller('api')
class StubController {
  @Get('ping')
  ping(): string {
    return 'pong';
  }
}

describe('security headers', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const publicDir = mkdtempSync(join(tmpdir(), 'spa-'));
    writeFileSync(join(publicDir, 'index.html'), '<html></html>');
    const moduleRef = await Test.createTestingModule({
      controllers: [StubController],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    applySecurityHeaders(app);
    app.useStaticAssets(publicDir);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['the API', '/api/ping'],
    ['the SPA served as static files', '/index.html'],
  ])('should protect %s', async (_label, path) => {
    const { headers } = await request(app.getHttpServer())
      .get(path)
      .expect(200);
    const csp = headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("img-src 'self' data:;");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(headers['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains',
    );
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['x-powered-by']).toBeUndefined();
  });
});
