import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { DatabaseModule } from './infrastructure/persistence/database.module';
import { AuthModule } from './interfaces/http/modules/auth.module';
import { HealthController } from './interfaces/http/controllers/health.controller';
import { HouseholdModule } from './interfaces/http/modules/household.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, 'public'),
      exclude: ['/api/(.*)', '/healthz'],
    }),
    AuthModule,
    HouseholdModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
