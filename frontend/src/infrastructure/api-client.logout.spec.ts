import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './api-client';

describe('apiClient.logout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts to /auth/logout and returns the redirect_to of the service-initiated flow', async () => {
    const fetchMock = vi.fn<() => Promise<unknown>>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ redirect_to: 'https://auth.example/logout?x=1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.logout()).resolves.toEqual({
      redirectTo: 'https://auth.example/logout?x=1',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('returns null for a local-only logout (null, absent, non-string redirect_to, empty body)', async () => {
    const empty = async () => {
      throw new SyntaxError('Unexpected end of JSON input');
    };
    for (const json of [
      async () => ({ redirect_to: null }),
      async () => ({}),
      async () => ({ redirect_to: 3 }),
      empty,
    ]) {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, status: 200, json }),
      );
      await expect(apiClient.logout()).resolves.toEqual({ redirectTo: null });
    }
  });
});
