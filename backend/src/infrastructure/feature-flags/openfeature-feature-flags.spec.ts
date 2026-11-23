import { randomUUID } from 'crypto';
import {
  Client,
  EvaluationContext,
  GeneralError,
  InMemoryProvider,
  OpenFeature,
  ResolutionDetails,
} from '@openfeature/server-sdk';
import {
  createFeatureFlags,
  FeatureFlagsLogger,
  OpenFeatureFeatureFlags,
} from './openfeature-feature-flags';

const KEY = 'some-flag';
const API_KEY = `hf_${'a'.repeat(64)}`;

/** InMemoryProvider that can be switched to failing (network down, 500, timeout...). */
class FlakyProvider extends InMemoryProvider {
  failing = false;
  calls = 0;

  override async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context?: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    this.calls += 1;
    if (this.failing) {
      throw new GeneralError('upstream down');
    }
    return super.resolveBooleanEvaluation(flagKey, defaultValue, context);
  }
}

function flag(value: boolean | 'unset') {
  return {
    variants: { on: true, off: false },
    defaultVariant: value === false ? 'off' : 'on',
    disabled: value === 'unset',
  };
}

function silentLogger() {
  return {
    warn: vi.fn<FeatureFlagsLogger['warn']>(),
    error: vi.fn<FeatureFlagsLogger['error']>(),
  };
}

describe('OpenFeatureFeatureFlags', () => {
  let provider: FlakyProvider;
  let now: number;
  let logger: ReturnType<typeof silentLogger>;
  let env: Record<string, string | undefined>;

  function flags(): OpenFeatureFeatureFlags {
    const domain = randomUUID();
    void OpenFeature.setProvider(domain, provider);
    return new OpenFeatureFeatureFlags(OpenFeature.getClient(domain), {
      env,
      logger,
      now: () => now,
    });
  }

  beforeEach(() => {
    provider = new FlakyProvider({ [KEY]: flag(true) });
    now = 1_000_000;
    logger = silentLogger();
    env = {};
  });

  afterAll(async () => {
    await OpenFeature.close();
  });

  it('returns the remote value', async () => {
    const featureFlags = flags();

    await expect(featureFlags.isEnabled(KEY, false)).resolves.toBe(true);
  });

  it('returns the code default when the flag has no value for this environment (DISABLED)', async () => {
    provider.putConfiguration({ [KEY]: flag('unset') });
    const featureFlags = flags();

    await expect(featureFlags.isEnabled(KEY, false)).resolves.toBe(false);
    await expect(featureFlags.isEnabled('other', true)).resolves.toBe(true);
  });

  it('returns the code default when the flag does not exist (FLAG_NOT_FOUND)', async () => {
    const featureFlags = flags();

    await expect(featureFlags.isEnabled('missing', true)).resolves.toBe(true);
    await expect(featureFlags.isEnabled('missing2', false)).resolves.toBe(
      false,
    );
  });

  it('memoizes each key for 30 s', async () => {
    const featureFlags = flags();
    await featureFlags.isEnabled(KEY, false);

    provider.putConfiguration({ [KEY]: flag(false) });
    now += 29_999;
    await expect(featureFlags.isEnabled(KEY, false)).resolves.toBe(true);
    expect(provider.calls).toBe(1);

    now += 1;
    await expect(featureFlags.isEnabled(KEY, false)).resolves.toBe(false);
    expect(provider.calls).toBe(2);
  });

  it('shares one evaluation between concurrent callers', async () => {
    const featureFlags = flags();

    const results = await Promise.all([
      featureFlags.isEnabled(KEY, false),
      featureFlags.isEnabled(KEY, false),
      featureFlags.isEnabled(KEY, false),
    ]);

    expect(results).toEqual([true, true, true]);
    expect(provider.calls).toBe(1);
  });

  it('gives each concurrent caller its own code default', async () => {
    provider.putConfiguration({ [KEY]: flag('unset') });
    const featureFlags = flags();

    const results = await Promise.all([
      featureFlags.isEnabled(KEY, true),
      featureFlags.isEnabled(KEY, false),
      featureFlags.isEnabled('missing', true),
      featureFlags.isEnabled('missing', false),
    ]);

    expect(results).toEqual([true, false, true, false]);
  });

  it('never throws, even if the client itself rejects', async () => {
    const client = {
      getBooleanDetails: () => Promise.reject(new TypeError('boom')),
    } as unknown as Client;
    const featureFlags = new OpenFeatureFeatureFlags(client, {
      env,
      logger,
      now: () => now,
    });

    await expect(featureFlags.isEnabled(KEY, true)).resolves.toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('TypeError'),
    );
  });

  it('closes OpenFeature on application shutdown', async () => {
    const close = vi.spyOn(OpenFeature, 'close');

    await flags().onApplicationShutdown();

    expect(close).toHaveBeenCalledTimes(1);
    close.mockRestore();
  });

  describe('on an evaluation error', () => {
    it('returns the last known value', async () => {
      const featureFlags = flags();
      await featureFlags.isEnabled(KEY, false);

      provider.failing = true;
      now += 30_000;

      await expect(featureFlags.isEnabled(KEY, false)).resolves.toBe(true);
    });

    it('returns the code default without a last known value', async () => {
      provider.failing = true;
      const featureFlags = flags();

      await expect(featureFlags.isEnabled(KEY, false)).resolves.toBe(false);
    });

    it('caches the failure for 30 s (negative caching)', async () => {
      const featureFlags = flags();
      await featureFlags.isEnabled(KEY, false);
      provider.failing = true;
      now += 30_000;
      await featureFlags.isEnabled(KEY, false);

      now += 29_999;
      await expect(featureFlags.isEnabled(KEY, false)).resolves.toBe(true);
      expect(provider.calls).toBe(2);

      now += 1;
      await expect(featureFlags.isEnabled(KEY, false)).resolves.toBe(true);
      expect(provider.calls).toBe(3);
    });

    it('keeps the last known value across successive failures', async () => {
      const featureFlags = flags();
      await featureFlags.isEnabled(KEY, false);
      provider.failing = true;

      for (let i = 0; i < 3; i += 1) {
        now += 30_000;
        await expect(featureFlags.isEnabled(KEY, false)).resolves.toBe(true);
      }
    });

    it('does not keep a deleted flag as last known value', async () => {
      const featureFlags = flags();
      await featureFlags.isEnabled(KEY, false);
      provider.putConfiguration({});
      now += 30_000;
      await expect(featureFlags.isEnabled(KEY, false)).resolves.toBe(false);

      provider.failing = true;
      now += 30_000;

      await expect(featureFlags.isEnabled(KEY, false)).resolves.toBe(false);
    });

    it('does not keep a value the environment no longer sets as last known value', async () => {
      const featureFlags = flags();
      await featureFlags.isEnabled(KEY, false);
      provider.putConfiguration({ [KEY]: flag('unset') });
      now += 30_000;
      await featureFlags.isEnabled(KEY, false);

      provider.failing = true;
      now += 30_000;

      await expect(featureFlags.isEnabled(KEY, false)).resolves.toBe(false);
    });

    it('warns at most every 5 minutes per key and error code', async () => {
      provider.failing = true;
      const featureFlags = flags();

      await featureFlags.isEnabled(KEY, false);
      now += 30_000;
      await featureFlags.isEnabled(KEY, false);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn.mock.calls[0]?.[0]).toEqual(
        expect.stringContaining(KEY),
      );
      expect(logger.warn.mock.calls[0]?.[0]).toEqual(
        expect.stringContaining('GENERAL: upstream down'),
      );

      await featureFlags.isEnabled('missing', false);
      expect(logger.warn).toHaveBeenCalledTimes(2);

      now += 5 * 60_000;
      await featureFlags.isEnabled(KEY, false);
      expect(logger.warn).toHaveBeenCalledTimes(3);
    });
  });

  describe('emergency pin FEATURES_PIN_<KEY>', () => {
    it('overrides the remote value', async () => {
      env.FEATURES_PIN_SOME_FLAG = 'false';
      const featureFlags = flags();

      await expect(featureFlags.isEnabled(KEY, true)).resolves.toBe(false);
      expect(provider.calls).toBe(0);
    });

    it('can force a flag on', async () => {
      env.FEATURES_PIN_MISSING_FLAG = 'true';
      const featureFlags = flags();

      await expect(featureFlags.isEnabled('missing-flag', false)).resolves.toBe(
        true,
      );
    });

    it('ignores (and reports once) a value other than true or false', async () => {
      env.FEATURES_PIN_SOME_FLAG = 'yes';
      const featureFlags = flags();

      await expect(featureFlags.isEnabled(KEY, false)).resolves.toBe(true);
      now += 30_000;
      await featureFlags.isEnabled(KEY, false);
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error.mock.calls[0]?.[0]).toEqual(
        expect.stringContaining('FEATURES_PIN_SOME_FLAG'),
      );
    });
  });
});

describe('createFeatureFlags', () => {
  afterEach(async () => {
    delete process.env.OFREP_HEADERS;
    delete process.env.OFREP_ENDPOINT;
    await OpenFeature.close();
  });

  it.each([
    ['both variables absent', {}],
    ['the API key absent', { FEATURES_OFREP_URL: 'https://features.test/api' }],
    ['the URL absent', { FEATURES_API_KEY: API_KEY }],
  ])(
    'is a no-op answering code defaults with %s, warning once',
    async (_label, vars) => {
      const logger = silentLogger();
      const featureFlags = createFeatureFlags(vars, { logger });

      await expect(featureFlags.isEnabled(KEY, true)).resolves.toBe(true);
      await expect(featureFlags.isEnabled(KEY, false)).resolves.toBe(false);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    },
  );

  it('still honours pins when disabled', async () => {
    const featureFlags = createFeatureFlags(
      { FEATURES_PIN_SOME_FLAG: 'true' },
      { logger: silentLogger() },
    );

    await expect(featureFlags.isEnabled(KEY, false)).resolves.toBe(true);
  });

  it.each([
    [
      'a malformed API key',
      { FEATURES_OFREP_URL: 'https://f.test/api', FEATURES_API_KEY: 'hf_123' },
    ],
    [
      'an old-format API key',
      {
        FEATURES_OFREP_URL: 'https://f.test/api',
        FEATURES_API_KEY: `hf_${'A'.repeat(64)}`,
      },
    ],
    [
      'a URL that is not a URL',
      { FEATURES_OFREP_URL: 'features.test', FEATURES_API_KEY: API_KEY },
    ],
    [
      'an http URL in production',
      {
        NODE_ENV: 'production',
        FEATURES_OFREP_URL: 'http://features.test/api',
        FEATURES_API_KEY: API_KEY,
      },
    ],
  ])(
    'is disabled (never blocking startup) with %s, logging an error',
    async (_label, vars) => {
      const logger = silentLogger();

      const featureFlags = createFeatureFlags(vars, { logger });

      await expect(featureFlags.isEnabled(KEY, true)).resolves.toBe(true);
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error.mock.calls[0]?.[0]).not.toContain(
        vars.FEATURES_API_KEY,
      );
    },
  );

  it('neutralises OFREP_HEADERS and OFREP_ENDPOINT, which the provider would read', () => {
    process.env.OFREP_HEADERS = 'X-Injected=1';
    process.env.OFREP_ENDPOINT = 'https://elsewhere.test';
    const logger = silentLogger();

    createFeatureFlags(
      { FEATURES_OFREP_URL: 'https://f.test/api', FEATURES_API_KEY: API_KEY },
      { logger },
    );

    expect(process.env.OFREP_HEADERS).toBeUndefined();
    expect(process.env.OFREP_ENDPOINT).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('OFREP_HEADERS'),
    );
  });
});
