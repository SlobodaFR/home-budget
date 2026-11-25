import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { clearLogoutStateCookie, setLogoutStateCookie } from './auth-cookies';

function fakeResponse() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const response = {
    cookie: (...args: unknown[]) => calls.push({ method: 'cookie', args }),
    clearCookie: (...args: unknown[]) =>
      calls.push({ method: 'clearCookie', args }),
  } as unknown as Response;
  return { response, calls };
}

const config = (nodeEnv: string) =>
  ({ get: () => nodeEnv }) as unknown as ConfigService;

describe('logout_state cookie', () => {
  it('is httpOnly, Lax, scoped to /api/auth, 10 min, Secure in production', () => {
    const { response, calls } = fakeResponse();
    setLogoutStateCookie(response, 's', config('production'));
    expect(calls[0].args).toEqual([
      'logout_state',
      's',
      {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/api/auth',
        maxAge: 600_000,
      },
    ]);
  });

  it('is not Secure outside production', () => {
    const { response, calls } = fakeResponse();
    setLogoutStateCookie(response, 's', config('development'));
    expect((calls[0].args[2] as { secure: boolean }).secure).toBe(false);
  });

  it('is cleared with the same Path and attributes as it was set with', () => {
    const { response, calls } = fakeResponse();
    clearLogoutStateCookie(response, config('production'));
    expect(calls[0]).toEqual({
      method: 'clearCookie',
      args: [
        'logout_state',
        {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/api/auth',
        },
      ],
    });
  });
});
