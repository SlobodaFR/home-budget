/**
 * OFREP client for home-features: boolean flags only, never blocking, never throwing.
 *
 * Self-contained (port aside): copied verbatim by every home-* service. Consumer semantics of
 * the home-features OFREP contract v1:
 * - FEATURES_PIN_<KEY_IN_UPPER_SNAKE>=true|false wins over everything (emergency pin);
 * - FEATURES_OFREP_URL + FEATURES_API_KEY absent (or invalid) → no-op, code defaults apply;
 * - one memo per key for 30 s: {value, source: remote | last-known | default, at};
 * - value set for the environment (STATIC) → that value; no value (DISABLED) or flag not found
 *   → code default, and nothing is kept as last-known;
 * - any other error (network, timeout, 401, 429, 5xx) → last-known value if any, else code
 *   default, memoized 30 s too (negative caching), WARN at most every 5 min per key + code;
 * - last-known lives in this process only: lost on restart.
 */
import { Logger, OnApplicationShutdown } from '@nestjs/common';
import { OFREPProvider } from '@openfeature/ofrep-provider';
import {
  Client,
  ErrorCode,
  EvaluationDetails,
  OpenFeature,
  StandardResolutionReasons,
} from '@openfeature/server-sdk';
import { FeatureFlags } from '../../domain/shared/feature-flags';

const MEMO_TTL_MS = 30_000;
const WARN_INTERVAL_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 500;
const API_KEY_FORMAT = /^hf_[0-9a-f]{64}$/;
/** Read by the OFREP provider from process.env, below our own options: never trusted. */
const PROVIDER_ENV_VARIABLES = [
  'OFREP_ENDPOINT',
  'OFREP_HEADERS',
  'OFREP_TIMEOUT_MS',
];
const OPENFEATURE_DOMAIN = 'home-features';

type Env = Record<string, string | undefined>;

export interface FeatureFlagsLogger {
  warn(message: string): void;
  error(message: string): void;
}

export interface FeatureFlagsOptions {
  env: Env;
  logger?: FeatureFlagsLogger;
  now?: () => number;
}

interface Memo {
  value: boolean;
  source: 'remote' | 'last-known' | 'default';
  at: number;
}

export class OpenFeatureFeatureFlags
  extends FeatureFlags
  implements OnApplicationShutdown
{
  private readonly env: Env;
  private readonly logger: FeatureFlagsLogger;
  private readonly now: () => number;
  private readonly memos = new Map<string, Memo>();
  private readonly pending = new Map<string, Promise<Memo>>();
  private readonly lastWarnings = new Map<string, number>();
  private readonly reportedPins = new Set<string>();

  /** `client` null: no-op, only pins and code defaults apply. */
  constructor(
    private readonly client: Client | null,
    options: FeatureFlagsOptions,
  ) {
    super();
    this.env = options.env;
    this.logger = options.logger ?? new Logger('FeatureFlags');
    this.now = options.now ?? Date.now;
  }

  async isEnabled(key: string, codeDefault: boolean): Promise<boolean> {
    const pinned = this.pin(key);
    if (pinned !== undefined) {
      return pinned;
    }
    if (!this.client) {
      return codeDefault;
    }
    const memo = this.memos.get(key);
    if (memo && this.now() - memo.at < MEMO_TTL_MS) {
      return memo.source === 'default' ? codeDefault : memo.value;
    }
    // Concurrent callers share one request, each getting its own code default back.
    let evaluation = this.pending.get(key);
    if (!evaluation) {
      evaluation = this.evaluate(this.client, key, codeDefault).finally(() =>
        this.pending.delete(key),
      );
      this.pending.set(key, evaluation);
    }
    const evaluated = await evaluation;
    return evaluated.source === 'default' ? codeDefault : evaluated.value;
  }

  async onApplicationShutdown(): Promise<void> {
    await OpenFeature.close();
  }

  private async evaluate(
    client: Client,
    key: string,
    codeDefault: boolean,
  ): Promise<Memo> {
    let details: Pick<
      EvaluationDetails<boolean>,
      'value' | 'reason' | 'errorCode' | 'errorMessage'
    >;
    try {
      details = await client.getBooleanDetails(key, codeDefault);
    } catch (error) {
      // The SDK already turns provider failures into error details; belt and braces for a copied file.
      details = {
        value: codeDefault,
        errorCode: ErrorCode.GENERAL,
        errorMessage:
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : 'unknown error',
      };
    }
    const at = this.now();
    const previous = this.memos.get(key);
    let memo: Memo;
    if (!details.errorCode) {
      const unset =
        details.reason === StandardResolutionReasons.DISABLED ||
        details.reason === StandardResolutionReasons.DEFAULT;
      memo = unset
        ? { value: codeDefault, source: 'default', at }
        : { value: details.value, source: 'remote', at };
    } else {
      memo =
        details.errorCode !== ErrorCode.FLAG_NOT_FOUND &&
        previous &&
        previous.source !== 'default'
          ? { value: previous.value, source: 'last-known', at }
          : { value: codeDefault, source: 'default', at };
      this.warn(key, details.errorCode, details.errorMessage, memo.source);
    }
    this.memos.set(key, memo);
    return memo;
  }

  private pin(key: string): boolean | undefined {
    const variable = `FEATURES_PIN_${key.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
    const raw = this.env[variable];
    if (raw === 'true' || raw === 'false') {
      return raw === 'true';
    }
    if (raw !== undefined && raw !== '' && !this.reportedPins.has(variable)) {
      this.reportedPins.add(variable);
      this.logger.error(`${variable} ignored: expected true or false`);
    }
    return undefined;
  }

  private warn(
    key: string,
    errorCode: string,
    errorMessage: string | undefined,
    source: Memo['source'],
  ): void {
    const id = `${key}\n${errorCode}`;
    const last = this.lastWarnings.get(id);
    if (last !== undefined && this.now() - last < WARN_INTERVAL_MS) {
      return;
    }
    this.lastWarnings.set(id, this.now());
    // errorMessage tells a bad key (unauthorized) from an outage: both arrive as GENERAL.
    this.logger.warn(
      `Feature flag ${key} not evaluated (${errorCode}: ${errorMessage ?? 'no detail'}): ${source === 'last-known' ? 'last known value' : 'code default'} used`,
    );
  }
}

/**
 * Builds the adapter from the environment. Never throws and never waits for home-features:
 * startup is not blocked, flags answer code defaults until the provider answers.
 */
export function createFeatureFlags(
  env: Env,
  options: Omit<FeatureFlagsOptions, 'env'> = {},
): OpenFeatureFeatureFlags {
  const logger = options.logger ?? new Logger('FeatureFlags');
  // process.env, not `env`: this is where the OFREP provider reads them.
  for (const variable of PROVIDER_ENV_VARIABLES) {
    if (process.env[variable] !== undefined) {
      delete process.env[variable];
      logger.warn(
        `${variable} ignored: home-features is configured only by FEATURES_OFREP_URL and FEATURES_API_KEY`,
      );
    }
  }

  // ofrep-core appends /ofrep/v1/... as is: a trailing slash would give //ofrep.
  const url = env.FEATURES_OFREP_URL?.replace(/\/+$/, '');
  const apiKey = env.FEATURES_API_KEY;
  if (!url || !apiKey) {
    logger.warn(
      'Feature flags disabled (FEATURES_OFREP_URL or FEATURES_API_KEY absent): code defaults apply',
    );
    return new OpenFeatureFeatureFlags(null, { ...options, env, logger });
  }
  const problem = configurationProblem(url, apiKey, env.NODE_ENV);
  if (problem) {
    logger.error(`Feature flags disabled: ${problem}`);
    return new OpenFeatureFeatureFlags(null, { ...options, env, logger });
  }

  // setProvider, never setProviderAndWait: startup never waits for home-features.
  void OpenFeature.setProvider(
    OPENFEATURE_DOMAIN,
    new OFREPProvider({
      baseUrl: url,
      timeoutMs: REQUEST_TIMEOUT_MS,
      headers: [['Authorization', `Bearer ${apiKey}`]],
    }),
  );
  return new OpenFeatureFeatureFlags(
    OpenFeature.getClient(OPENFEATURE_DOMAIN),
    {
      ...options,
      env,
      logger,
    },
  );
}

function configurationProblem(
  url: string,
  apiKey: string,
  nodeEnv: string | undefined,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'FEATURES_OFREP_URL is not a URL';
  }
  const allowed = nodeEnv === 'production' ? ['https:'] : ['https:', 'http:'];
  if (!allowed.includes(parsed.protocol)) {
    return `FEATURES_OFREP_URL must use ${nodeEnv === 'production' ? 'https' : 'http(s)'}`;
  }
  if (!API_KEY_FORMAT.test(apiKey)) {
    return 'FEATURES_API_KEY must match hf_ followed by 64 lowercase hex characters';
  }
  return null;
}
