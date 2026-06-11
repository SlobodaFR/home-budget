import { Injectable } from '@nestjs/common';
import { OAuthClient, TokenPair } from '../../domain/auth/oauth-client';
import { User } from '../../domain/user/user';
import { UserRepository } from '../../domain/user/user.repository';

export interface OAuthCallbackResult {
  tokens: TokenPair;
  user: User;
}

/** Exchanges an authorization code for tokens and upserts the local user mirror. */
@Injectable()
export class HandleOAuthCallbackUseCase {
  constructor(
    private readonly oauthClient: OAuthClient,
    private readonly userRepository: UserRepository,
  ) {}

  async execute(
    code: string,
    redirectUri: string,
  ): Promise<OAuthCallbackResult> {
    const tokens = await this.oauthClient.exchangeCode(code, redirectUri);
    const profile = await this.oauthClient.fetchUserInfo(tokens.accessToken);

    const existing = await this.userRepository.findById(profile.id);
    const user = existing
      ? existing.withProfile(profile)
      : User.create({
          id: profile.id,
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          createdAt: new Date(),
        });

    await this.userRepository.save(user);

    return { tokens, user };
  }
}
