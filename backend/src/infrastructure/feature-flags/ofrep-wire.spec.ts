import { createServer, IncomingHttpHeaders, Server } from 'http';
import { AddressInfo } from 'net';
import { OpenFeature } from '@openfeature/server-sdk';
import type { Mock } from 'vitest';
import { createFeatureFlags } from './openfeature-feature-flags';

const API_KEY = `hf_${'0123456789abcdef'.repeat(4)}`;

interface Reply {
  status: number;
  body?: unknown;
  /** Never answers: the client must time out. */
  hang?: boolean;
  headers?: Record<string, string>;
}

/** Responses of home-features (OFREP contract v1), by flag key. */
const REPLIES: Record<string, Reply> = {
  'static-on': {
    status: 200,
    body: {
      key: 'static-on',
      value: true,
      reason: 'STATIC',
      variant: 'on',
      metadata: {},
    },
  },
  'static-off': {
    status: 200,
    body: {
      key: 'static-off',
      value: false,
      reason: 'STATIC',
      variant: 'off',
      metadata: {},
    },
  },
  unset: {
    status: 200,
    body: { key: 'unset', reason: 'DISABLED', metadata: {} },
  },
  missing: {
    status: 404,
    body: {
      key: 'missing',
      errorCode: 'FLAG_NOT_FOUND',
      errorDetails: 'flag not found',
    },
  },
  broken: { status: 500, body: { errorDetails: 'internal error' } },
  slow: { status: 200, hang: true },
  unauthorized: { status: 401, body: { errorDetails: 'invalid api key' } },
  'rate-limited': {
    status: 429,
    body: { errorDetails: 'too many requests' },
    headers: { 'Retry-After': '1' },
  },
};

describe('OFREP wire format (local home-features stub)', () => {
  let server: Server;
  let baseUrl: string;
  const requests: {
    url?: string;
    method?: string;
    headers: IncomingHttpHeaders;
    body: string;
  }[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        requests.push({
          url: req.url,
          method: req.method,
          headers: req.headers,
          body,
        });
        const key = decodeURIComponent(req.url?.split('/').pop() ?? '');
        const reply = REPLIES[key] ?? {
          status: 404,
          body: { key, errorCode: 'FLAG_NOT_FOUND' },
        };
        if (reply.hang) {
          return;
        }
        res.writeHead(reply.status, {
          'Content-Type': 'application/json',
          ...reply.headers,
        });
        res.end(JSON.stringify(reply.body));
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });

  afterAll(async () => {
    await OpenFeature.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  let logger: {
    warn: Mock<(message: string) => void>;
    error: Mock<(message: string) => void>;
  };

  function flags(url = baseUrl) {
    logger = {
      warn: vi.fn<(message: string) => void>(),
      error: vi.fn<(message: string) => void>(),
    };
    return createFeatureFlags(
      { FEATURES_OFREP_URL: url, FEATURES_API_KEY: API_KEY },
      { logger },
    );
  }

  it('POSTs to {base}/ofrep/v1/evaluate/flags/{key} with the bearer API key', async () => {
    process.env.OFREP_HEADERS = 'X-Injected=1';

    await flags().isEnabled('static-on', false);

    const request = requests.find((r) => r.url?.endsWith('/static-on'));
    expect(request).toMatchObject({
      method: 'POST',
      url: '/api/ofrep/v1/evaluate/flags/static-on',
    });
    expect(request?.headers.authorization).toBe(`Bearer ${API_KEY}`);
    expect(request?.headers['x-injected']).toBeUndefined();
  });

  it.each([
    ['200 STATIC on', 'static-on', false, true],
    ['200 STATIC off', 'static-off', true, false],
    ['200 DISABLED without value → code default', 'unset', true, true],
    ['200 DISABLED without value → code default', 'unset', false, false],
    ['404 FLAG_NOT_FOUND → code default', 'missing', true, true],
    ['500 → code default', 'broken', true, true],
    ['500 → code default', 'broken', false, false],
  ])('%s', async (_label, key, codeDefault, expected) => {
    await expect(flags().isEnabled(key, codeDefault)).resolves.toBe(expected);
  });

  it.each([
    ['401 (bad or revoked key)', 'unauthorized', 'unauthorized'],
    ['429 (rate limited)', 'rate-limited', 'rate limit'],
  ])(
    '%s → code default, with a warning telling the cause',
    async (_label, key, cause) => {
      await expect(flags().isEnabled(key, true)).resolves.toBe(true);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(cause));
    },
  );

  it('tolerates a trailing slash in FEATURES_OFREP_URL', async () => {
    await expect(
      flags(`${baseUrl}/`).isEnabled('static-off', true),
    ).resolves.toBe(false);

    expect(requests.at(-1)?.url).toBe(
      '/api/ofrep/v1/evaluate/flags/static-off',
    );
  });

  it('answers the code default after a 500 ms timeout', async () => {
    const started = Date.now();

    await expect(flags().isEnabled('slow', true)).resolves.toBe(true);

    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(450);
    expect(elapsed).toBeLessThan(2_000);
  });
});
