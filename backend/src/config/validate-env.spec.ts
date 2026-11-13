import { randomBytes } from 'node:crypto';
import { validateEnv } from './validate-env';

const production = () => ({
  NODE_ENV: 'production',
  AUTH_SERVICE_URL: 'https://auth.example.test',
  FRONTEND_URL: 'https://budget.example.test',
  AUTH_CLIENT_ID: 'budget',
  AUTH_CLIENT_SECRET: 'client-secret',
  AUTH_WEBHOOK_SECRET: 'webhook-secret',
  PERSONAL_DATA_KEY: randomBytes(32).toString('hex'),
  PSEUDONYM_SECRET: randomBytes(32).toString('hex'),
});

describe('validateEnv', () => {
  it('requires nothing outside production', () => {
    expect(() => validateEnv({})).not.toThrow();
    expect(() => validateEnv({ AUTH_MODE: 'dev' })).not.toThrow();
  });

  it('rejects an unknown AUTH_MODE everywhere', () => {
    expect(() => validateEnv({ AUTH_MODE: 'sso' })).toThrow(/AUTH_MODE/);
  });

  it('accepts a complete production environment, with or without AUTH_MODE', () => {
    expect(() => validateEnv(production())).not.toThrow();
    expect(() =>
      validateEnv({ ...production(), AUTH_MODE: 'oauth' }),
    ).not.toThrow();
  });

  it('accepts a base64 PERSONAL_DATA_KEY', () => {
    const env = {
      ...production(),
      PERSONAL_DATA_KEY: randomBytes(32).toString('base64'),
    };
    expect(() => validateEnv(env)).not.toThrow();
  });

  it('refuses the dev mode in production', () => {
    expect(() => validateEnv({ ...production(), AUTH_MODE: 'dev' })).toThrow(
      /AUTH_MODE/,
    );
  });

  it.each(['AUTH_SERVICE_URL', 'FRONTEND_URL'])(
    'requires %s to be an https URL in production',
    (variable) => {
      for (const value of [undefined, '', 'http://x.test', 'not a url'])
        expect(() =>
          validateEnv({ ...production(), [variable]: value }),
        ).toThrow(variable);
    },
  );

  it.each(['AUTH_CLIENT_ID', 'AUTH_CLIENT_SECRET', 'AUTH_WEBHOOK_SECRET'])(
    'requires %s in production',
    (variable) => {
      for (const value of [undefined, '', '   '])
        expect(() =>
          validateEnv({ ...production(), [variable]: value }),
        ).toThrow(variable);
    },
  );

  it('requires a 32-byte PERSONAL_DATA_KEY in production', () => {
    for (const value of [
      undefined,
      '',
      randomBytes(31).toString('hex'),
      randomBytes(16).toString('base64'),
    ])
      expect(() =>
        validateEnv({ ...production(), PERSONAL_DATA_KEY: value }),
      ).toThrow('PERSONAL_DATA_KEY');
  });

  it('never echoes a secret value in its errors', () => {
    const env = { ...production(), PERSONAL_DATA_KEY: 'deadbeef-secret' };
    expect(() => validateEnv(env)).toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining('deadbeef-secret'),
      }),
    );
  });
  it('requires a PSEUDONYM_SECRET of at least 32 bytes in production', () => {
    for (const value of [undefined, '', 'a'.repeat(31)])
      expect(() =>
        validateEnv({ ...production(), PSEUDONYM_SECRET: value }),
      ).toThrow('PSEUDONYM_SECRET');
    expect(() =>
      validateEnv({ ...production(), PSEUDONYM_SECRET: 'a'.repeat(32) }),
    ).not.toThrow();
  });
});
