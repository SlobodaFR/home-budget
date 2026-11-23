import {
  Controller,
  ExecutionContext,
  Get,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { lastValueFrom, of } from 'rxjs';
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

  it('should report nothing for a request that matches no route', async () => {
    await request(app.getHttpServer())
      .get('/nope/alice@example.com?email=bob@example.com')
      .expect(404);

    expect(telemetry.captured).toEqual([]);
  });

  it('should ignore non-HTTP contexts: a WebSocket handler sharing the global interceptor emits nothing', async () => {
    const interceptor = new TelemetryInterceptor(telemetry);
    const next = { handle: () => of('pong') };
    const wsContext = {
      getType: () => 'ws',
      switchToHttp: () => {
        throw new Error('must not read an HTTP request on a ws context');
      },
    } as unknown as ExecutionContext;

    await lastValueFrom(interceptor.intercept(wsContext, next));

    expect(telemetry.captured).toEqual([]);
  });

  it('should never report an email carried by a query string or a path parameter', async () => {
    await request(app.getHttpServer())
      .get('/api/spaces/alice@example.com/transactions?email=bob@example.com')
      .expect(200);

    expect(telemetry.captured).toHaveLength(1);
    expect(JSON.stringify(telemetry.captured)).not.toMatch(/alice|bob|@/);
    expect(telemetry.captured[0]?.event).toMatchObject({
      properties: { route: '/api/spaces/:spaceId/transactions' },
    });
  });
});
