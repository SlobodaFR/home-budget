import type { MockInstance } from 'vitest';
import { Logger } from '@nestjs/common';
import { SpyTelemetry } from '../../testing/spy-telemetry';
import { RuntimeHealthMonitor } from './runtime-health.monitor';

function blockEventLoop(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // attente active volontaire
  }
}

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('RuntimeHealthMonitor', () => {
  let telemetry: SpyTelemetry;
  let monitor: RuntimeHealthMonitor;
  let warn: MockInstance;

  beforeEach(() => {
    telemetry = new SpyTelemetry();
    monitor = new RuntimeHealthMonitor(telemetry);
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    monitor.start();
  });

  afterEach(() => {
    monitor.stop();
    warn.mockRestore();
  });

  it('should have no sample before the first one is taken', () => {
    expect(monitor.lastSample).toBeNull();
  });

  it('should measure an event-loop block, report it and warn on p99', async () => {
    await tick(50);
    blockEventLoop(500);
    await tick(50);

    const sample = monitor.sample();

    expect(sample.lag_max_ms).toBeGreaterThanOrEqual(400);
    expect(sample.elu).toBeGreaterThan(0);
    expect(sample.heap_used_mb).toBeGreaterThan(0);
    expect(sample.rss_mb).toBeGreaterThan(0);
    expect(monitor.lastSample).toEqual(sample);
    expect(telemetry.captured).toEqual([
      { event: { name: 'runtime_health', properties: sample } },
    ]);
    expect(JSON.stringify(warn.mock.calls)).toContain('p99');
  });

  it('should reset the histogram between samples', async () => {
    await tick(50);
    blockEventLoop(500);
    await tick(50);
    const first = monitor.sample();

    await tick(200);
    const second = monitor.sample();

    expect(second.lag_max_ms).toBeLessThan(first.lag_max_ms / 2);
  });

  it('should stop measuring once stopped, and tolerate a second stop', () => {
    monitor.stop();

    expect(() => monitor.stop()).not.toThrow();
  });

  it('should report runtime_health with exactly the six shared properties, as numbers', () => {
    monitor.sample();

    const { event } = telemetry.captured[0] as {
      event: { name: string; properties: Record<string, unknown> };
    };
    expect(event.name).toBe('runtime_health');
    expect(Object.keys(event.properties).toSorted()).toEqual([
      'elu',
      'heap_used_mb',
      'lag_max_ms',
      'lag_p50_ms',
      'lag_p99_ms',
      'rss_mb',
    ]);
    expect(
      Object.values(event.properties).every((v) => typeof v === 'number'),
    ).toBe(true);
  });

  it('should sample every 60 s from the start, once per period', () => {
    monitor.stop();
    vi.useFakeTimers();
    try {
      monitor.start();
      vi.advanceTimersByTime(59_999);
      expect(telemetry.captured).toHaveLength(0);
      vi.advanceTimersByTime(1);
      expect(telemetry.captured).toHaveLength(1);
      vi.advanceTimersByTime(120_000);
      expect(telemetry.captured).toHaveLength(3);
    } finally {
      monitor.stop();
      vi.useRealTimers();
    }
  });

  it('should start on application bootstrap and stop on shutdown', () => {
    monitor.stop();
    vi.useFakeTimers();
    try {
      monitor.onApplicationBootstrap();
      vi.advanceTimersByTime(60_000);
      expect(telemetry.captured).toHaveLength(1);
      monitor.onApplicationShutdown();
      vi.advanceTimersByTime(180_000);
      expect(telemetry.captured).toHaveLength(1);
    } finally {
      monitor.stop();
      vi.useRealTimers();
    }
  });
});
