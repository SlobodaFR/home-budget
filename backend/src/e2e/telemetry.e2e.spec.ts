import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { DebtExtractionJobs } from '../application/debt-extraction/debt-extraction.jobs';
import {
  ExportDataUseCase,
  ExportTransactionsCsvUseCase,
} from '../application/export/export.use-cases';
import { CreateHouseholdUseCase } from '../application/household/create-household.use-case';
import { CommitImportUseCase } from '../application/import/import.use-cases';
import { NoTelemetry, Telemetry } from '../domain/shared/telemetry';
import { PostHogTelemetry } from '../infrastructure/telemetry/posthog-telemetry';
import { SpyTelemetry } from '../testing/spy-telemetry';

describe('Télémétrie (AppModule réel, SQLite en mémoire)', () => {
  const env = { ...process.env };

  beforeAll(() => {
    Object.assign(process.env, {
      AUTH_MODE: 'dev',
      NODE_ENV: 'test',
      DATABASE_PATH: ':memory:',
      FRONTEND_URL: 'http://localhost:3000',
    });
    delete process.env.PERSONAL_DATA_KEY;
    delete process.env.POSTHOG_API_KEY;
  });
  afterAll(() => {
    process.env = env;
  });

  async function boot(spy?: SpyTelemetry): Promise<NestExpressApplication> {
    let builder = Test.createTestingModule({ imports: [AppModule] });
    if (spy) builder = builder.overrideProvider(Telemetry).useValue(spy);
    const moduleRef = await builder.compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    return app;
  }

  it('injecte le vrai fournisseur (PostHog, inactif sans clé) dans les cas d’usage, pas le NoTelemetry par défaut', async () => {
    const app = await boot();
    try {
      const telemetry = app.get(Telemetry);
      expect(telemetry).toBeInstanceOf(PostHogTelemetry);
      // @Optional() masquerait un oubli de cablage : chaque capteur doit recevoir le vrai fournisseur.
      for (const consumer of [
        CreateHouseholdUseCase,
        CommitImportUseCase,
        ExportDataUseCase,
        ExportTransactionsCsvUseCase,
        DebtExtractionJobs,
      ]) {
        const injected: unknown = Reflect.get(app.get(consumer), 'telemetry');
        expect(injected).toBe(telemetry);
        expect(injected).not.toBeInstanceOf(NoTelemetry);
      }
    } finally {
      await app.close();
    }
  });

  it('rapporte la création du foyer (pseudonymisable) et la requête HTTP, sans donnée personnelle', async () => {
    const spy = new SpyTelemetry();
    const app = await boot(spy);
    try {
      const alice = request
        .agent(app.getHttpServer())
        .set('Sec-Fetch-Site', 'same-origin');
      await alice.get('/api/auth/dev-login?as=alice').expect(302);
      await alice
        .post('/api/household')
        .send({ name: 'Foyer Dupont' })
        .expect(201);

      const names = spy.captured.map(({ event }) => event.name);
      expect(names).toContain('household_created');
      expect(names).toContain('http_request');
      const created = spy.captured.find(
        ({ event }) => event.name === 'household_created',
      );
      expect(created?.userId).toEqual(expect.any(String));
      const http = spy.captured.find(
        ({ event }) =>
          event.name === 'http_request' &&
          event.properties.route === '/api/household' &&
          event.properties.method === 'POST',
      );
      expect(http?.event.properties).toMatchObject({ status: 201 });
      expect(JSON.stringify(spy.captured)).not.toContain('Dupont');
    } finally {
      await app.close();
    }
  });
});
