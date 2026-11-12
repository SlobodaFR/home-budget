import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
import { DatabaseModule } from './infrastructure/persistence/database.module';
import { AuthModule } from './interfaces/http/modules/auth.module';
import { HealthController } from './interfaces/http/controllers/health.controller';
import { HouseholdModule } from './interfaces/http/modules/household.module';
import { throttlerOptions } from './interfaces/http/throttling';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
