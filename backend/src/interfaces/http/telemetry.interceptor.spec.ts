import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Telemetry } from '../../domain/shared/telemetry';
import { SpyTelemetry } from '../../testing/spy-telemetry';
import { TelemetryInterceptor } from './telemetry.interceptor';

@Controller()
class StubController {
  @Get('api/spaces/:spaceId/transactions')
  transactions(@Param('spaceId') spaceId: string): string[] {
    if (spaceId === 'missing') throw new NotFoundException();
    return [];
  }

  @Get('healthz')
  health(): string {
    return 'ok';
  }
}

describe('TelemetryInterceptor', () => {
  let app: NestExpressApplication;
  let telemetry: SpyTelemetry;

  beforeEach(async () => {
    telemetry = new SpyTelemetry();
    const moduleRef = await Test.createTestingModule({
      controllers: [StubController],
      providers: [
        { provide: Telemetry, useValue: telemetry },
        { provide: APP_INTERCEPTOR, useClass: TelemetryInterceptor },
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should report the parameterized route and status, never the raw URL', async () => {
    await request(app.getHttpServer())
      .get('/api/spaces/82eb01b5/transactions?user=Thomas')
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/spaces/missing/transactions')
      .expect(404);

    expect(telemetry.captured.map(({ event }) => event.properties)).toEqual([
      expect.objectContaining({
        route: '/api/spaces/:spaceId/transactions',
        method: 'GET',
        status: 200,
      }),
      expect.objectContaining({
        route: '/api/spaces/:spaceId/transactions',
        status: 404,
      }),
    ]);
    expect(JSON.stringify(telemetry.captured)).not.toMatch(/82eb01b5|Thomas/);
    expect(telemetry.captured.every(({ userId }) => userId === undefined)).toBe(
      true,
    );
  });

  it('should not report the health check', async () => {
    await request(app.getHttpServer()).get('/healthz').expect(200);

    expect(telemetry.captured).toEqual([]);
  });
});
