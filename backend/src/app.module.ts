import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { join } from 'path';
import { loggerParams } from './infrastructure/logging/logger.config';
import { DatabaseModule } from './infrastructure/persistence/database.module';
import { AuthModule } from './interfaces/http/modules/auth.module';
import { HealthController } from './interfaces/http/controllers/health.controller';
import { SameOriginGuard } from './interfaces/http/guards/same-origin.guard';
import { HouseholdModule } from './interfaces/http/modules/household.module';
import { throttlerOptions } from './interfaces/http/throttling';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Apres ConfigModule : backend/.env est deja charge dans process.env.
    LoggerModule.forRoot(
      loggerParams(process.env.NODE_ENV, process.env.PSEUDONYM_SECRET),
    ),
    DatabaseModule,
    ThrottlerModule.forRoot(throttlerOptions),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, 'public'),
      exclude: ['/api/(.*)', '/healthz'],
    }),
    AuthModule,
    HouseholdModule,
  ],
  controllers: [HealthController],
  // Throttler d'abord : les mutations refusees par SameOriginGuard sont aussi comptees.
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SameOriginGuard },
  ],
})
export class AppModule {}
