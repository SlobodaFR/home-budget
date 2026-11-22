import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
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
import { HandleOAuthCallbackUseCase } from '../../../application/auth/handle-oauth-callback.use-case';
import { HandleSessionRevokedUseCase } from '../../../application/auth/handle-session-revoked.use-case';
import { OAuthClient } from '../../../domain/auth/oauth-client';
import { clearAuthCookies, setAuthCookies } from '../auth-cookies';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
import { ServerToServer } from '../decorators/server-to-server.decorator';
import { SessionRevokedDto } from '../dto/session-revoked.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly oauthClient: OAuthClient,
    private readonly handleOAuthCallback: HandleOAuthCallbackUseCase,
    private readonly handleSessionRevoked: HandleSessionRevokedUseCase,
    private readonly authenticateLogoutWebhook: AuthenticateLogoutWebhookUseCase,
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

  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    clearAuthCookies(res);
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
    return new URL(
      '/api/auth/callback',
      this.config.getOrThrow<string>('FRONTEND_URL'),
    ).toString();
  }
}
