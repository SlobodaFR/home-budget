import type { IncomingMessage, ServerResponse } from 'node:http';
import { REDACT_PATHS, loggerParams } from './logger.config';
import { pseudonymize } from './pseudonymize';

type PinoHttp = {
  level: string;
  serializers: {
    req: (req: unknown) => unknown;
    res: (res: unknown) => unknown;
  };
  autoLogging: { ignore: (req: IncomingMessage) => boolean };
  customProps: (req: IncomingMessage, res: ServerResponse) => object;
  customLogLevel: (
    req: IncomingMessage,
    res: ServerResponse,
    err?: Error,
  ) => string;
};
const SECRET = 'p'.repeat(64);
const USER = { id: 'user-42', email: 'alice@example.test', name: 'Alice' };
const http = (
  nodeEnv = 'production',
  { secret }: { secret?: string } = { secret: SECRET },
) => loggerParams(nodeEnv, secret).pinoHttp as unknown as PinoHttp;
const req = (url: string, extra: object = {}) =>
  ({
    method: 'POST',
    url,
    headers: { cookie: 'access_token=abc' },
    ...extra,
  }) as unknown as IncomingMessage;
const res = (statusCode: number) =>
  ({
    statusCode,
    getHeaders: () => ({ 'set-cookie': 'x' }),
  }) as unknown as ServerResponse;

describe('loggerParams', () => {
  it('keeps only method and path: no headers, no query string (webhook secret, OAuth code)', () => {
    expect(
      http().serializers.req(req('/api/auth/disconnect?secret=s3cret')),
    ).toEqual({ method: 'POST', url: '/api/auth/disconnect' });
    expect(http().serializers.req(req('/api/auth/callback?code=c0de'))).toEqual(
      { method: 'POST', url: '/api/auth/callback' },
    );
    expect(http().serializers.res(res(201))).toEqual({ statusCode: 201 });
  });

  it('logs API calls only, not the front, its assets or /healthz', () => {
    const { ignore } = http().autoLogging;
    expect(ignore(req('/api/household'))).toBe(false);
    for (const url of [
      '/',
      '/assets/index.js',
      '/sw.js',
      '/healthz',
      '/dettes',
    ])
      expect(ignore(req(url))).toBe(true);
  });

  it('identifies the user by a pseudonym of its id, never by email or name', () => {
    const props = http().customProps(
      req('/api/household', { user: USER }),
      res(200),
    );
    expect(props).toEqual({ user: pseudonymize(USER.id, SECRET) });
    const line = JSON.stringify(props);
    for (const value of [USER.id, USER.email, USER.name])
      expect(line).not.toContain(value);
  });

  it('drops the user when no pseudonym secret is configured, or when anonymous', () => {
    expect(
      http('production', {}).customProps(
        req('/api/household', { user: USER }),
        res(200),
      ),
    ).toEqual({});
    expect(http().customProps(req('/api/auth/config'), res(200))).toEqual({});
  });

  it('maps the status to a level and stays silent in tests', () => {
    const level = http().customLogLevel;
    expect(level(req('/api/x'), res(200))).toBe('info');
    expect(level(req('/api/x'), res(404))).toBe('warn');
    expect(level(req('/api/x'), res(500))).toBe('error');
    expect(http('test').level).toBe('silent');
  });
});

describe('REDACT_PATHS', () => {
  it('hides the SQL parameters of a database error (labels, amounts, names)', async () => {
    const { default: pino } = await import('pino');
    const { QueryFailedError } = await import('typeorm');
    const lines: string[] = [];
    const logger = pino(
      { redact: REDACT_PATHS },
      { write: (line: string) => lines.push(line) },
    );
    const error = new QueryFailedError(
      'INSERT INTO transaction (label, amount_cents, owner) VALUES (?, ?, ?)',
      ['Loyer Dupont', 123456, 'alice@example.test'],
      new Error('SQLITE_BUSY: database is locked'),
    );

    logger.error({ err: error });

    expect(lines.join('')).not.toMatch(/Dupont|123456|alice@|transaction/);
  });
});
