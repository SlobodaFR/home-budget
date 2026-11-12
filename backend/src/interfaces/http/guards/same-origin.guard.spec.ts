import {
  ExecutionContext,
  ForbiddenException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { SameOriginGuard } from './same-origin.guard';

function guard(
  env: Record<string, string> = { FRONTEND_URL: 'https://budget.sloboda.fr' },
  serverToServer = false,
) {
  const reflector = {
    getAllAndOverride: () => serverToServer,
  } as unknown as Reflector;
  return new SameOriginGuard(new ConfigService(env), reflector);
}

function context(
  method: string,
  headers: Record<string, string>,
): ExecutionContext {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, headers: lower }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('SameOriginGuard', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'lets %s through whatever the headers',
    (method) => {
      expect(
        guard().canActivate(
          context(method, { 'Sec-Fetch-Site': 'cross-site' }),
        ),
      ).toBe(true);
    },
  );

  it('accepts a same-origin request', () => {
    expect(
      guard().canActivate(context('POST', { 'Sec-Fetch-Site': 'same-origin' })),
    ).toBe(true);
  });

  // same-site est exactement l'attaque : un autre sous-domaine *.sloboda.fr.
  it.each(['same-site', 'cross-site', 'none'])(
    'refuses Sec-Fetch-Site %s even with a trusted Origin',
    (site) => {
      expect(() =>
        guard().canActivate(
          context('DELETE', {
            'Sec-Fetch-Site': site,
            Origin: 'https://budget.sloboda.fr',
          }),
        ),
      ).toThrow(ForbiddenException);
    },
  );

  it('falls back to a trusted Origin when Sec-Fetch-Site is absent', () => {
    expect(
      guard().canActivate(
        context('PUT', { Origin: 'https://budget.sloboda.fr' }),
      ),
    ).toBe(true);
  });

  it('refuses an untrusted Origin, or no Origin at all', () => {
    expect(() =>
      guard().canActivate(
        context('POST', { Origin: 'https://auth.sloboda.fr' }),
      ),
    ).toThrow(ForbiddenException);
    expect(() => guard().canActivate(context('PATCH', {}))).toThrow(
      ForbiddenException,
    );
  });

  it('trusts localhost:3000 when FRONTEND_URL is unset (dev)', () => {
    expect(
      guard({}).canActivate(
        context('POST', { Origin: 'http://localhost:3000' }),
      ),
    ).toBe(true);
  });

  it.each(['application/x-www-form-urlencoded', 'text/plain; charset=utf-8'])(
    'refuses a %s body even from the same origin',
    (contentType) => {
      expect(() =>
        guard().canActivate(
          context('POST', {
            'Sec-Fetch-Site': 'same-origin',
            'Content-Type': contentType,
          }),
        ),
      ).toThrow(UnsupportedMediaTypeException);
    },
  );

  it('accepts JSON and multipart uploads from the same origin', () => {
    for (const contentType of [
      'application/json',
      'multipart/form-data; boundary=x',
    ])
      expect(
        guard().canActivate(
          context('POST', {
            'Sec-Fetch-Site': 'same-origin',
            'Content-Type': contentType,
          }),
        ),
      ).toBe(true);
  });

  it('skips server-to-server routes (webhook without cookie)', () => {
    expect(guard(undefined, true).canActivate(context('POST', {}))).toBe(true);
  });
});
