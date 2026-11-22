import { describe, expect, it, vi } from 'vitest';
import {
  OAuthClient,
  TokenPair,
  UserProfile,
} from '../../domain/auth/oauth-client';
import { SingleFlightOAuthClient } from './single-flight-oauth-client';

function pair(refreshToken: string): TokenPair {
  return {
    accessToken: `access-${refreshToken}`,
    refreshToken,
    expiresIn: 900,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeUpstream(refresh: (rt: string) => Promise<TokenPair>) {
  const upstream = {
    authorizeUrl: vi.fn<(redirectUri: string) => string>(
      (redirectUri) => `https://auth/${redirectUri}`,
    ),
    exchangeCode: vi.fn<
      (code: string, redirectUri: string) => Promise<TokenPair>
    >(async () => pair('exchanged')),
    refresh: vi.fn<(rt: string) => Promise<TokenPair>>(refresh),
    fetchUserInfo: vi.fn<(accessToken: string) => Promise<UserProfile>>(
      async () => ({
        id: '1',
        email: 'a@b.c',
        name: 'A',
        avatarUrl: '',
      }),
    ),
  };
  return upstream as typeof upstream & OAuthClient;
}

describe('SingleFlightOAuthClient', () => {
  it('merges concurrent refreshes of the same token into one upstream call', async () => {
    const d = deferred<TokenPair>();
    const upstream = makeUpstream(() => d.promise);
    const client = new SingleFlightOAuthClient(upstream);

    const a = client.refresh('rt-1');
    const b = client.refresh('rt-1');
    d.resolve(pair('rt-2'));

    const [ra, rb] = await Promise.all([a, b]);
    expect(upstream.refresh).toHaveBeenCalledTimes(1);
    expect(ra).toEqual(pair('rt-2'));
    expect(rb).toBe(ra);
  });

  it('does not cache the result: a call after settle hits upstream again', async () => {
    const upstream = makeUpstream(async (rt) => pair(`${rt}-next`));
    const client = new SingleFlightOAuthClient(upstream);

    await client.refresh('rt-1');
    await client.refresh('rt-1');

    expect(upstream.refresh).toHaveBeenCalledTimes(2);
  });

  it('shares a rejection between waiters and does not cache it', async () => {
    const d = deferred<TokenPair>();
    const upstream = makeUpstream(() => d.promise);
    const client = new SingleFlightOAuthClient(upstream);

    const a = client.refresh('rt-1');
    const b = client.refresh('rt-1');
    const failure = new Error('invalid_grant');
    d.reject(failure);

    await expect(a).rejects.toBe(failure);
    await expect(b).rejects.toBe(failure);
    expect(upstream.refresh).toHaveBeenCalledTimes(1);

    upstream.refresh.mockResolvedValueOnce(pair('rt-2'));
    await expect(client.refresh('rt-1')).resolves.toEqual(pair('rt-2'));
    expect(upstream.refresh).toHaveBeenCalledTimes(2);
  });

  it('does not merge refreshes of different tokens', async () => {
    const upstream = makeUpstream(async (rt) => pair(`${rt}-next`));
    const client = new SingleFlightOAuthClient(upstream);

    const [a, b] = await Promise.all([
      client.refresh('rt-1'),
      client.refresh('rt-2'),
    ]);

    expect(upstream.refresh).toHaveBeenCalledTimes(2);
    expect(a.refreshToken).toBe('rt-1-next');
    expect(b.refreshToken).toBe('rt-2-next');
  });

  it('delegates the other operations untouched', async () => {
    const upstream = makeUpstream(async (rt) => pair(rt));
    const client = new SingleFlightOAuthClient(upstream);

    expect(client.authorizeUrl('cb')).toBe('https://auth/cb');
    await client.exchangeCode('code', 'cb');
    await client.fetchUserInfo('at');
    expect(upstream.exchangeCode).toHaveBeenCalledWith('code', 'cb');
    expect(upstream.fetchUserInfo).toHaveBeenCalledWith('at');
  });
});
