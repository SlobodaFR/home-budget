import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Telemetry } from '../../domain/shared/telemetry';
import { TelemetryInterceptor } from '../../interfaces/http/telemetry.interceptor';
import { createPostHogTelemetry } from './posthog-telemetry';

/** Global : les cas d'usage (HouseholdModule…) reçoivent le port sans l'importer. */
@Global()
@Module({
  providers: [
    // Lu à la création du module, après ConfigModule (backend/.env déjà dans process.env).
    {
      provide: Telemetry,
      useFactory: () => createPostHogTelemetry(process.env),
    },
    { provide: APP_INTERCEPTOR, useClass: TelemetryInterceptor },
  ],
  exports: [Telemetry],
})
export class TelemetryModule {}
