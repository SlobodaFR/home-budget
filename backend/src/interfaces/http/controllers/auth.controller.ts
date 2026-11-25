import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  RawBodyRequest,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthenticateLogoutWebhookUseCase } from '../../../application/auth/authenticate-logout-webhook.use-case';
import { InitiateServiceLogoutUseCase } from '../../../application/auth/initiate-service-logout.use-case';
import { HandleOAuthCallbackUseCase } from '../../../application/auth/handle-oauth-callback.use-case';
import { HandleSessionRevokedUseCase } from '../../../application/auth/handle-session-revoked.use-case';
import { OAuthClient } from '../../../domain/auth/oauth-client';
import {
  clearAuthCookies,
  clearLogoutStateCookie,
  setAuthCookies,
  setLogoutStateCookie,
} from '../auth-cookies';
import {
  ACCESS_TOKEN_COOKIE_NAME,
  LOGOUT_STATE_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
} from '../auth-session';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
import { ServerToServer } from '../decorators/server-to-server.decorator';
import { SessionRevokedDto } from '../dto/session-revoked.dto';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly oauthClient: OAuthClient,
    private readonly handleOAuthCallback: HandleOAuthCallbackUseCase,
    private readonly handleSessionRevoked: HandleSessionRevokedUseCase,
    private readonly authenticateLogoutWebhook: AuthenticateLogoutWebhookUseCase,
    private readonly initiateServiceLogout: InitiateServiceLogoutUseCase,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('login')
  login(@Res() res: Response): void {
    res.redirect(this.oauthClient.authorizeUrl(this.callbackUrl()));
  }

  @Public()
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Res() res: Response,
  ): Promise<void> {
    const { tokens } = await this.handleOAuthCallback.execute(
      code,
      this.callbackUrl(),
    );
    setAuthCookies(res, tokens, this.config);
    res.redirect(this.config.getOrThrow<string>('FRONTEND_URL'));
  }

  /**
   * Local logout. Behind `auth-rp-initiated-logout`, also returns the home-auth logout URL (PC10)
   * for the SPA to reach by a top-level navigation; `redirect_to` is null otherwise (local-only).
   * POST + the global SameOriginGuard: no logout-CSRF. Local cookies are always dropped, the
   * refresh token included (home-auth revokes nothing).
   */
  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ redirect_to: string | null }> {
    // The body may carry a bearer token hint: never cached.
    res.setHeader('Cache-Control', 'no-store');
    const state = randomBytes(32).toString('base64url');
    let redirectTo: string | null = null;
    try {
      redirectTo = await this.initiateServiceLogout.execute({
        accessToken: cookieValue(req, ACCESS_TOKEN_COOKIE_NAME),
        refreshToken: cookieValue(req, REFRESH_TOKEN_COOKIE_NAME),
        state,
        postLogoutRedirectUri: this.frontendUrl('/api/auth/logged-out'),
      });
    } catch (error) {
      // Falls back to the local-only logout (always the case in AUTH_MODE=dev), but not silently.
      this.logger.warn(
        `Service-initiated logout unavailable, local-only logout: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
    clearAuthCookies(res);
    if (redirectTo) {
      setLogoutStateCookie(res, state, this.config);
    }
    return { redirect_to: redirectTo };
  }

  /**
   * Return from home-auth after a service-initiated logout. No effect besides dropping the state
   * cookie: the state must match the one stored by POST /auth/logout (missing, repeated or
   * different: neutral /login, no banner). Never starts /authorize.
   */
  @Public()
  @Get('logged-out')
  loggedOut(
    @Query('state') state: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    res.setHeader('Cache-Control', 'no-store');
    const expected = cookieValue(req, LOGOUT_STATE_COOKIE_NAME);
    const matches =
      typeof state === 'string' &&
      state !== '' &&
      expected !== undefined &&
      timingSafeEqual(sha256(state), sha256(expected));
    clearLogoutStateCookie(res, this.config);
    res.redirect(this.frontendUrl(matches ? '/login?logged_out=1' : '/login'));
  }

  @Get('me')
  me(@CurrentUser() user: CurrentUserPayload) {
    return { user };
  }

  /**
   * Webhook called by the central auth service on global logout (logoutWebhookUrl). Authenticated
   * by its HMAC signature (X-Auth-Webhook-*), or by the legacy `?secret=` until
   * `auth-webhook-require-signature` is on.
   */
  @Public()
  @ServerToServer()
  @Post('disconnect')
  @HttpCode(204)
  async disconnect(
    @Req() req: RawBodyRequest<Request>,
    @Body() dto: SessionRevokedDto,
    @Headers('x-auth-webhook-id') id?: string,
    @Headers('x-auth-webhook-timestamp') timestamp?: string,
    @Headers('x-auth-webhook-signature') signature?: string,
    @Query('secret') secret?: string,
  ): Promise<void> {
    const authentic = await this.authenticateLogoutWebhook.execute({
      headers: { id, timestamp, signature },
      rawBody: req.rawBody,
      querySecret: typeof secret === 'string' ? secret : undefined,
    });
    if (!authentic) {
      throw new UnauthorizedException();
    }
    await this.handleSessionRevoked.execute(dto.userId);
  }

  private callbackUrl(): string {
    return this.frontendUrl('/api/auth/callback');
  }

  private frontendUrl(path: string): string {
    return new URL(
      path,
      this.config.getOrThrow<string>('FRONTEND_URL'),
    ).toString();
  }
}

function cookieValue(req: Request, name: string): string | undefined {
  const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[
    name
  ];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
