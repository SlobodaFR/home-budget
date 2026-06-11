import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { AccessTokenVerifier } from '../../../domain/auth/access-token-verifier';
import { OAuthClient } from '../../../domain/auth/oauth-client';
import { RevokedSessionRepository } from '../../../domain/auth/revoked-session.repository';
import { setAuthCookies } from '../auth-cookies';
import { CurrentUserPayload } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

export const ACCESS_TOKEN_COOKIE_NAME = 'access_token';
export const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';

export interface AuthenticatedRequest extends Request {
  cookies: Record<string, string | undefined>;
  user?: CurrentUserPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly accessTokenVerifier: AccessTokenVerifier,
    private readonly oauthClient: OAuthClient,
    private readonly revokedSessionRepository: RevokedSessionRepository,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();

    const accessToken = request.cookies[ACCESS_TOKEN_COOKIE_NAME];
    if (accessToken) {
      const payload = await this.accessTokenVerifier.verify(accessToken);
      if (
        payload &&
        (await this.isSessionValid(payload.sub, payload.issuedAt))
      ) {
        request.user = {
          id: payload.sub,
          email: payload.email,
          name: payload.name,
        };
        return true;
      }
    }

    const refreshToken = request.cookies[REFRESH_TOKEN_COOKIE_NAME];
    if (refreshToken) {
      try {
        const tokenPair = await this.oauthClient.refresh(refreshToken);
        const payload = await this.accessTokenVerifier.verify(
          tokenPair.accessToken,
        );
        if (
          payload &&
          (await this.isSessionValid(payload.sub, payload.issuedAt))
        ) {
          setAuthCookies(response, tokenPair, this.config);
          request.user = {
            id: payload.sub,
            email: payload.email,
            name: payload.name,
          };
          return true;
        }
      } catch {
        // Refresh failed (revoked/expired refresh token) - fall through to 401.
      }
    }

    throw new UnauthorizedException();
  }

  private async isSessionValid(
    userId: string,
    issuedAt: Date,
  ): Promise<boolean> {
    const revokedAt = await this.revokedSessionRepository.getRevokedAt(userId);
    return !revokedAt || issuedAt >= revokedAt;
  }
}
