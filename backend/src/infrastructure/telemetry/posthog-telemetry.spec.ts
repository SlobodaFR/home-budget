import { pseudonymize } from '../logging/pseudonymize';
import {
  createPostHogTelemetry,
  PostHogClient,
  PostHogTelemetry,
  sanitizeTelemetryProperties,
} from './posthog-telemetry';

const SECRET = 's'.repeat(64);
type CaptureMessage = Parameters<PostHogClient['capture']>[0];

class FakeClient implements PostHogClient {
  readonly captured: CaptureMessage[] = [];
  shutdowns: Array<number | undefined> = [];
  failing = false;

  capture(message: CaptureMessage): void {
    if (this.failing) throw new Error('network');
    this.captured.push(message);
  }

  async shutdown(shutdownTimeoutMs?: number): Promise<void> {
    this.shutdowns.push(shutdownTimeoutMs);
    return Promise.resolve();
  }
}

const imported = {
  name: 'statement_imported',
  properties: { rows: 12 },
} as const;

describe('PostHogTelemetry', () => {
  it('should create no client without POSTHOG_API_KEY', () => {
    const factory =
      vi.fn<(apiKey: string, options: unknown) => PostHogClient>();

    createPostHogTelemetry({ PSEUDONYM_SECRET: SECRET }, factory).capture(
      imported,
      'user-1',
    );

    expect(factory).not.toHaveBeenCalled();
  });

  it('should create an EU, geoip-free client when a key is set', () => {
    const factory = vi
      .fn<(apiKey: string, options: unknown) => PostHogClient>()
      .mockReturnValue(new FakeClient());

    createPostHogTelemetry(
      { POSTHOG_API_KEY: 'phc_test', PSEUDONYM_SECRET: SECRET },
      factory,
    );

    expect(factory).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({
        host: 'https://eu.i.posthog.com',
        disableGeoip: true,
      }),
    );
  });

  it('should honour POSTHOG_HOST', () => {
    const factory = vi
      .fn<(apiKey: string, options: unknown) => PostHogClient>()
      .mockReturnValue(new FakeClient());

    createPostHogTelemetry(
      { POSTHOG_API_KEY: 'phc_test', POSTHOG_HOST: 'https://ph.example.org' },
      factory,
    );

    expect(factory).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({ host: 'https://ph.example.org' }),
    );
  });

  it('should send the event under the pseudonymized member, tagged with the service and no IP', () => {
    const client = new FakeClient();

    new PostHogTelemetry(client, SECRET).capture(imported, 'user-1');

    expect(client.captured).toEqual([
      {
        distinctId: pseudonymize('user-1', SECRET),
        event: 'statement_imported',
        properties: { rows: 12, service: 'home-budget', $ip: null },
        disableGeoip: true,
      },
    ]);
    expect(JSON.stringify(client.captured)).not.toContain('user-1');
  });

  it.each([
    ['no member is given', SECRET, undefined],
    ['there is no pseudonym secret', undefined, 'user-1'],
  ])('should send an anonymous event when %s', (_label, secret, userId) => {
    const client = new FakeClient();

    new PostHogTelemetry(client, secret).capture(imported, userId);

    const [message] = client.captured;
    expect(message?.properties.$process_person_profile).toBe(false);
    expect(JSON.stringify(client.captured)).not.toContain('user-1');
  });

  it('should never throw into the caller', () => {
    const client = new FakeClient();
    client.failing = true;

    expect(() =>
      new PostHogTelemetry(client, SECRET).capture(imported),
    ).not.toThrow();
  });

  it('should flush on shutdown within Docker stop grace period', async () => {
    const client = new FakeClient();

    await new PostHogTelemetry(client, SECRET).onApplicationShutdown();

    expect(client.shutdowns).toEqual([5_000]);
  });
});

describe('sanitizeTelemetryProperties', () => {
  it('should drop personal-looking keys and values, keep the rest', () => {
    expect(
      sanitizeTelemetryProperties({
        format: 'csv',
        rows: 7,
        name: 'Foyer Dupont',
        label: 'Loyer',
        amount: 1200,
        filename: 'releve.pdf',
        member: 'thomas@example.com',
        household: '82eb01b5-98d3-49d9-8aa0-36a97250a910',
        from: '203.0.113.1',
        nested: { a: 1 },
      }),
    ).toEqual({ format: 'csv', rows: 7 });
  });
});
