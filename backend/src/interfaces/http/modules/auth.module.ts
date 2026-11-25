import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthenticateLogoutWebhookUseCase } from '../../../application/auth/authenticate-logout-webhook.use-case';
import { InitiateServiceLogoutUseCase } from '../../../application/auth/initiate-service-logout.use-case';
import { HandleOAuthCallbackUseCase } from '../../../application/auth/handle-oauth-callback.use-case';
import { HandleSessionRevokedUseCase } from '../../../application/auth/handle-session-revoked.use-case';
import { AccessTokenVerifier } from '../../../domain/auth/access-token-verifier';
import { OAuthClient } from '../../../domain/auth/oauth-client';
import { WebhookSignatureVerifier } from '../../../domain/auth/webhook-signature';
import { Clock } from '../../../domain/shared/clock';
import { RevokedSessionRepository } from '../../../domain/auth/revoked-session.repository';
import { FeatureFlags } from '../../../domain/shared/feature-flags';
import { UserRepository } from '../../../domain/user/user.repository';
import { ConfigService } from '@nestjs/config';
import { resolveAuthMode } from '../../../infrastructure/auth/auth-mode';
import {
  DevAccessTokenVerifier,
  UnavailableOAuthClient,
} from '../../../infrastructure/auth/dev-auth';
import { AuthConfigController } from '../controllers/auth-config.controller';
import { HttpOAuthClient } from '../../../infrastructure/auth/http-oauth-client';
import { SingleFlightOAuthClient } from '../../../infrastructure/auth/single-flight-oauth-client';
import { JwksAccessTokenVerifier } from '../../../infrastructure/auth/jwks-access-token-verifier';
import { SystemClock } from '../../../infrastructure/time/system-clock';
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
          : new SingleFlightOAuthClient(new HttpOAuthClient(config)),
    },
    {
      provide: AccessTokenVerifier,
      inject: [ConfigService, FeatureFlags],
      useFactory: (config: ConfigService, flags: FeatureFlags) =>
        resolveAuthMode(config) === 'dev'
          ? new DevAccessTokenVerifier(config)
          : new JwksAccessTokenVerifier(config, flags),
    },
    HandleOAuthCallbackUseCase,
    HandleSessionRevokedUseCase,
    {
      provide: InitiateServiceLogoutUseCase,
      inject: [FeatureFlags, AccessTokenVerifier, OAuthClient],
      useFactory: (
        flags: FeatureFlags,
        verifier: AccessTokenVerifier,
        oauthClient: OAuthClient,
      ) => new InitiateServiceLogoutUseCase(flags, verifier, oauthClient),
    },
    { provide: Clock, useClass: SystemClock },
    {
      provide: AuthenticateLogoutWebhookUseCase,
      inject: [ConfigService, Clock, FeatureFlags],
      useFactory: (
        config: ConfigService,
        clock: Clock,
        flags: FeatureFlags,
      ) => {
        // Optionnel : sans lui, seul l'ancien ?secret= authentifie le webhook (valide au demarrage).
        const signingSecret = config.get<string>('AUTH_WEBHOOK_SIGNING_SECRET');
        return new AuthenticateLogoutWebhookUseCase(
          signingSecret
            ? new WebhookSignatureVerifier(signingSecret, clock)
            : null,
          config.get<string>('AUTH_WEBHOOK_SECRET', ''),
          flags,
          clock,
        );
      },
    },
    JwtAuthGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [UserRepository],
})
export class AuthModule {}
