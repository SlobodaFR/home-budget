import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { TokenPair } from '../../domain/auth/oauth-client';
import {
  ACCESS_TOKEN_COOKIE_NAME,
  LOGOUT_STATE_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
} from './auth-session';

const REFRESH_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Sets the access + refresh token cookies issued by the central auth service. */
export function setAuthCookies(
  response: Response,
  tokens: TokenPair,
  config: ConfigService,
): void {
  const secure = config.get<string>('NODE_ENV') === 'production';

  response.cookie(ACCESS_TOKEN_COOKIE_NAME, tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: tokens.expiresIn * 1000,
  });

  response.cookie(REFRESH_TOKEN_COOKIE_NAME, tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  });
}

export function clearAuthCookies(response: Response): void {
  response.clearCookie(ACCESS_TOKEN_COOKIE_NAME);
  response.clearCookie(REFRESH_TOKEN_COOKIE_NAME);
}

const LOGOUT_STATE_MAX_AGE_MS = 10 * 60 * 1000;

/** Same options for set and clear: express only clears a cookie whose Path matches. */
function logoutStateCookieOptions(config: ConfigService) {
  return {
    httpOnly: true,
    secure: config.get<string>('NODE_ENV') === 'production',
    sameSite: 'lax' as const,
    path: '/api/auth',
  };
}

/** Short-lived anti-CSRF `state` of the service-initiated logout (PC10), checked on return. */
export function setLogoutStateCookie(
  response: Response,
  state: string,
  config: ConfigService,
): void {
  response.cookie(LOGOUT_STATE_COOKIE_NAME, state, {
    ...logoutStateCookieOptions(config),
    maxAge: LOGOUT_STATE_MAX_AGE_MS,
  });
}

export function clearLogoutStateCookie(
  response: Response,
  config: ConfigService,
): void {
  response.clearCookie(
    LOGOUT_STATE_COOKIE_NAME,
    logoutStateCookieOptions(config),
  );
}
