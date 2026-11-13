import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ServeStaticModule } from '@nestjs/serve-static';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { configureApp } from '../../configure-app';
import { serveStaticOptions } from './static-assets';

@Controller()
class HealthStub {
  @Get('healthz')
  healthz() {
    return { status: 'ok' };
  }
}

@Controller()
class ApiStub {
  @Get('ping')
  ping() {
    return { pong: true };
  }
}

describe('fallback SPA (ServeStatic, Express 5)', () => {
  let root: string;
  let app: NestExpressApplication;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'spa-'));
    writeFileSync(join(root, 'index.html'), '<html>SPA</html>');
    mkdirSync(join(root, 'assets'));
    writeFileSync(join(root, 'assets', 'app.js'), 'console.log(1)');

    @Module({
      imports: [ServeStaticModule.forRoot(serveStaticOptions(root))],
      controllers: [HealthStub, ApiStub],
    })
    class TestModule {}

    // NestFactory (pas Test.createTestingModule) : ServeStatic choisit son chargeur selon
    // l'adaptateur HTTP, absent tant que l'application n'existe pas.
    app = await NestFactory.create<NestExpressApplication>(TestModule, {
      logger: false,
    });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  const get = (path: string) => request(app.getHttpServer()).get(path);

  it('sert index.html à la racine', async () => {
    const res = await get('/').expect(200);
    expect(res.text).toContain('SPA');
  });

  it('retombe sur index.html pour une route du SPA', async () => {
    const res = await get('/dettes').expect(200);
    expect(res.text).toContain('SPA');
  });

  it('sert un fichier statique réel', async () => {
    await get('/assets/app.js').expect(200);
  });

  it('laisse passer les routes API', async () => {
    const res = await get('/api/ping').expect(200);
    expect(res.body).toEqual({ pong: true });
  });

  it('renvoie 404 JSON, pas le SPA, pour une route API inconnue', async () => {
    const res = await get('/api/inconnu').expect(404);
    expect(res.text).not.toContain('SPA');
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('laisse passer /healthz', async () => {
    const res = await get('/healthz').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
