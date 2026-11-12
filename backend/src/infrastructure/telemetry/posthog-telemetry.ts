import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { Logger, OnApplicationShutdown } from '@nestjs/common';
import { PostHog } from 'posthog-node';
import { Telemetry, TelemetryEvent } from '../../domain/shared/telemetry';
import { pseudonymize } from '../logging/pseudonymize';

const DEFAULT_HOST = 'https://eu.i.posthog.com';
// Sous le délai d'arrêt de Docker (10 s) : un PostHog injoignable ne retarde pas le redémarrage.
const SHUTDOWN_TIMEOUT_MS = 5_000;

/** La partie du client posthog-node utilisée ici (injectable pour les tests). */
export interface PostHogClient {
  capture(message: {
    distinctId: string;
    event: string;
    properties: Record<string, unknown>;
    disableGeoip: boolean;
  }): void;
  shutdown(shutdownTimeoutMs?: number): Promise<void>;
}

type PostHogClientFactory = (
  apiKey: string,
  options: {
    host: string;
    disableGeoip: boolean;
    flushAt: number;
    flushInterval: number;
  },
) => PostHogClient;

const createPostHogClient: PostHogClientFactory = (apiKey, options) =>
  new PostHog(apiKey, options);

/** Désactivée (aucun client, aucun appel réseau) sans POSTHOG_API_KEY. */
export function createPostHogTelemetry(
  env: {
    POSTHOG_API_KEY?: string;
    POSTHOG_HOST?: string;
    PSEUDONYM_SECRET?: string;
  },
  factory: PostHogClientFactory = createPostHogClient,
): PostHogTelemetry {
  const client = env.POSTHOG_API_KEY
    ? factory(env.POSTHOG_API_KEY, {
        host: env.POSTHOG_HOST ?? DEFAULT_HOST,
        disableGeoip: true,
        flushAt: 20,
        flushInterval: 10_000,
      })
    : null;
  return new PostHogTelemetry(client, env.PSEUDONYM_SECRET);
}

const FORBIDDEN_KEYS = new Set([
  'name',
  'email',
  'ip',
  'token',
  'secret',
  'cookie',
  'label',
  'amount',
  'filename',
]);
const SENSITIVE_VALUE_PATTERNS = [
  /@/, // e-mail
  /[0-9a-f]{32,}/i, // jetons, empreintes
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, // identifiants bruts
];

const isSafeValue = (value: unknown): boolean =>
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  (typeof value === 'string' &&
    isIP(value) === 0 &&
    !SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value)));

/** Dernière ligne de défense : retire toute propriété dont la clé ou la valeur ressemble à une donnée personnelle. */
export function sanitizeTelemetryProperties(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(properties).filter(
      ([key, value]) =>
        !FORBIDDEN_KEYS.has(key.toLowerCase()) && isSafeValue(value),
    ),
  );
}

export class PostHogTelemetry
  extends Telemetry
  implements OnApplicationShutdown
{
  private readonly logger = new Logger(PostHogTelemetry.name);

  constructor(
    private readonly client: PostHogClient | null,
    private readonly pseudonymSecret: string | undefined,
  ) {
    super();
  }

  capture(event: TelemetryEvent, userId?: string): void {
    if (!this.client) return;
    // Sans secret (hors production), le membre n'est pas identifiable : événement anonyme.
    const distinctId =
      userId && this.pseudonymSecret
        ? pseudonymize(userId, this.pseudonymSecret)
        : undefined;
    try {
      this.client.capture({
        distinctId: distinctId ?? randomUUID(),
        event: event.name,
        properties: {
          ...sanitizeTelemetryProperties(event.properties),
          // Le projet PostHog est partagé par plusieurs services home-*.
          service: 'home-budget',
          // Ceinture et bretelles : le vrai contrôle est le réglage projet « Discard client IP data ».
          $ip: null,
          ...(distinctId ? {} : { $process_person_profile: false }),
        },
        disableGeoip: true,
      });
    } catch (error) {
      this.logger.warn(
        `Échec de la télémétrie : ${error instanceof Error ? error.name : 'inconnu'}`,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client?.shutdown(SHUTDOWN_TIMEOUT_MS);
  }
}
