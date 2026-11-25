import { AccessTokenVerifier } from '../../domain/auth/access-token-verifier';
import { OAuthClient, TokenPair } from '../../domain/auth/oauth-client';
import { FeatureFlags } from '../../domain/shared/feature-flags';
import {
  InitiateServiceLogoutUseCase,
  RP_LOGOUT_FLAG,
} from './initiate-service-logout.use-case';

const RETURN_URI = 'https://budget.example.test/api/auth/logged-out';

class FakeFlags extends FeatureFlags {
  keys: Array<[string, boolean]> = [];
  constructor(private readonly on: boolean) {
    super();
  }
  async isEnabled(key: string, codeDefault: boolean): Promise<boolean> {
    this.keys.push([key, codeDefault]);
    return this.on;
  }
}

function setup(
  options: {
    flag?: boolean;
    validTokens?: string[];
    refresh?: () => Promise<TokenPair>;
    timeoutMs?: number;
  } = {},
) {
  const flags = new FakeFlags(options.flag ?? true);
  const verifier: AccessTokenVerifier = {
    verify: async (token: string) =>
      (options.validTokens ?? []).includes(token)
        ? { sub: 'u1', email: 'e', name: 'n', issuedAt: new Date() }
        : null,
  };
  const refresh = vi.fn<() => Promise<TokenPair>>(
    options.refresh ?? (() => Promise.reject(new Error('refresh failed'))),
  );
  const oauth = {
    refresh,
    logoutUrl: (p: {
      postLogoutRedirectUri: string;
      state: string;
      accessTokenHint?: string;
    }) =>
      `https://auth.example.test/logout?s=${p.state}&r=${p.postLogoutRedirectUri}&h=${p.accessTokenHint ?? ''}`,
  } as unknown as OAuthClient;
  const useCase = new InitiateServiceLogoutUseCase(
    flags,
    verifier,
    oauth,
    options.timeoutMs ?? 50,
  );
  return { useCase, flags, refresh };
}

const base = { state: 'st', postLogoutRedirectUri: RETURN_URI };

describe('InitiateServiceLogoutUseCase', () => {
  it('reads the flag with a code default of false and returns null when off, without refreshing', async () => {
    const { useCase, flags, refresh } = setup({ flag: false });
    expect(
      await useCase.execute({
        ...base,
        accessToken: 'a',
        refreshToken: 'r',
      }),
    ).toBeNull();
    expect(flags.keys).toEqual([[RP_LOGOUT_FLAG, false]]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('uses the current access token as hint when it verifies', async () => {
    const { useCase, refresh } = setup({ validTokens: ['a'] });
    const url = await useCase.execute({
      ...base,
      accessToken: 'a',
      refreshToken: 'r',
    });
    expect(url).toContain('h=a');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes when the access token is absent or invalid and hints with the new token', async () => {
    const { useCase, refresh } = setup({
      validTokens: ['new'],
      refresh: async () => ({
        accessToken: 'new',
        refreshToken: 'r2',
        expiresIn: 900,
      }),
    });
    expect(
      await useCase.execute({
        ...base,
        accessToken: 'stale',
        refreshToken: 'r',
      }),
    ).toContain('h=new');
    expect(await useCase.execute({ ...base, refreshToken: 'r' })).toContain(
      'h=new',
    );
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('sends no hint when refresh fails (never a logout signal, never throws)', async () => {
    const { useCase } = setup();
    const url = await useCase.execute({ ...base, refreshToken: 'r' });
    expect(url).toContain('h=');
    expect(url).not.toContain('h=a');
    expect(url?.endsWith('h=')).toBe(true);
  });

  it('sends no hint when the refreshed token does not verify', async () => {
    const { useCase } = setup({
      refresh: async () => ({
        accessToken: 'bad',
        refreshToken: 'r2',
        expiresIn: 900,
      }),
    });
    expect(
      (await useCase.execute({ ...base, refreshToken: 'r' }))?.endsWith('h='),
    ).toBe(true);
  });

  it('gives up on a slow refresh after the timeout', async () => {
    const { useCase } = setup({
      refresh: () => new Promise(() => undefined),
      timeoutMs: 20,
    });
    const url = await useCase.execute({ ...base, refreshToken: 'r' });
    expect(url?.endsWith('h=')).toBe(true);
  });

  it('still returns a logout URL with no cookies at all', async () => {
    const { useCase, refresh } = setup();
    const url = await useCase.execute({ ...base });
    expect(url?.endsWith('h=')).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
  });
});
