import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OAuthClient,
  TokenPair,
  UserProfile,
} from '../../domain/auth/oauth-client';

interface TokenPairDto {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

interface UserInfoDto {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
}

/** Talks to the central auth service (auth.sloboda.fr) over HTTP. */
@Injectable()
export class HttpOAuthClient extends OAuthClient {
  private readonly authServiceUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(private readonly config: ConfigService) {
    super();
    this.authServiceUrl = this.config.getOrThrow<string>('AUTH_SERVICE_URL');
    this.clientId = this.config.getOrThrow<string>('AUTH_CLIENT_ID');
    this.clientSecret = this.config.getOrThrow<string>('AUTH_CLIENT_SECRET');
  }

  authorizeUrl(redirectUri: string): string {
    const url = new URL('/authorize', this.authServiceUrl);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    return url.toString();
  }

  async exchangeCode(code: string, redirectUri: string): Promise<TokenPair> {
    return this.requestToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    return this.requestToken({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  async fetchUserInfo(accessToken: string): Promise<UserProfile> {
    const response = await fetch(new URL('/userinfo', this.authServiceUrl), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch user info: ${response.status}`);
    }
    const dto = (await response.json()) as UserInfoDto;
    return {
      id: dto.id,
      email: dto.email,
      name: dto.name,
      avatarUrl: dto.avatarUrl,
    };
  }

  private async requestToken(
    params: Record<string, string>,
  ): Promise<TokenPair> {
    const response = await fetch(new URL('/token', this.authServiceUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        ...params,
      }),
    });
    if (!response.ok) {
      throw new Error(`Token request failed: ${response.status}`);
    }
    const dto = (await response.json()) as TokenPairDto;
    return {
      accessToken: dto.accessToken,
      refreshToken: dto.refreshToken,
      expiresIn: dto.expiresIn,
    };
  }
}
