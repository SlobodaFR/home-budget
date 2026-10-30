import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HandleOAuthCallbackUseCase } from '../../../application/auth/handle-oauth-callback.use-case';
import { HandleSessionRevokedUseCase } from '../../../application/auth/handle-session-revoked.use-case';
import { AccessTokenVerifier } from '../../../domain/auth/access-token-verifier';
import { OAuthClient } from '../../../domain/auth/oauth-client';
import { RevokedSessionRepository } from '../../../domain/auth/revoked-session.repository';
import { UserRepository } from '../../../domain/user/user.repository';
import { ConfigService } from '@nestjs/config';
import { resolveAuthMode } from '../../../infrastructure/auth/auth-mode';
import {
  DevAccessTokenVerifier,
  UnavailableOAuthClient,
} from '../../../infrastructure/auth/dev-auth';
import { AuthConfigController } from '../controllers/auth-config.controller';
import { HttpOAuthClient } from '../../../infrastructure/auth/http-oauth-client';
import { JwksAccessTokenVerifier } from '../../../infrastructure/auth/jwks-access-token-verifier';
import { RevokedSessionOrmEntity } from '../../../infrastructure/persistence/entities/revoked-session.orm-entity';
import { UserOrmEntity } from '../../../infrastructure/persistence/entities/user.orm-entity';
import { TypeOrmRevokedSessionRepository } from '../../../infrastructure/persistence/repositories/typeorm-revoked-session.repository';
import { TypeOrmUserRepository } from '../../../infrastructure/persistence/repositories/typeorm-user.repository';
import { AuthController } from '../controllers/auth.controller';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@Module({
  imports: [TypeOrmModule.forFeature([UserOrmEntity, RevokedSessionOrmEntity])],
  controllers: [AuthController, AuthConfigController],
  providers: [
    { provide: UserRepository, useClass: TypeOrmUserRepository },
    {
      provide: RevokedSessionRepository,
      useClass: TypeOrmRevokedSessionRepository,
    },
    {
      provide: OAuthClient,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        resolveAuthMode(config) === 'dev'
          ? new UnavailableOAuthClient()
          : new HttpOAuthClient(config),
    },
    {
      provide: AccessTokenVerifier,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        resolveAuthMode(config) === 'dev'
          ? new DevAccessTokenVerifier(config)
          : new JwksAccessTokenVerifier(config),
    },
    HandleOAuthCallbackUseCase,
    HandleSessionRevokedUseCase,
    JwtAuthGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [UserRepository],
})
export class AuthModule {}
