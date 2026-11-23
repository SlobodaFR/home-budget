import { monitorEventLoopDelay, performance } from 'perf_hooks';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Telemetry } from '../../domain/shared/telemetry';

// Derived: @types/node does not export these interfaces from 'perf_hooks' in every version.
type IntervalHistogram = ReturnType<typeof monitorEventLoopDelay>;
type EventLoopUtilization = ReturnType<typeof performance.eventLoopUtilization>;

const SAMPLE_INTERVAL_MS = 60_000;
const HISTOGRAM_RESOLUTION_MS = 20;
const LAG_WARN_P99_MS = 100;
const MB = 1024 * 1024;
const NS_PER_MS = 1e6;

export interface RuntimeHealthSample {
  lag_p50_ms: number;
  lag_p99_ms: number;
  lag_max_ms: number;
  elu: number;
  heap_used_mb: number;
  rss_mb: number;
}

const round = (value: number, digits: number) => Number(value.toFixed(digits));

/**
 * Santé de la boucle d'événements : percentiles de retard, utilisation et mémoire, échantillonnés
 * chaque minute et envoyés en télémétrie runtime_health. Sources de blocage connues : OCR et
 * extraction de texte des relevés, import/export de gros fichiers.
 */
@Injectable()
export class RuntimeHealthMonitor
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(RuntimeHealthMonitor.name);
  private histogram: IntervalHistogram | null = null;
  private timer: NodeJS.Timeout | null = null;
  private previousUtilization: EventLoopUtilization | null = null;
  lastSample: RuntimeHealthSample | null = null;

  constructor(private readonly telemetry: Telemetry) {}

  onApplicationBootstrap(): void {
    this.start();
  }

  onApplicationShutdown(): void {
    this.stop();
  }

  start(): void {
    this.stop(); // idempotent: never leak a previous histogram or timer
    this.histogram = monitorEventLoopDelay({
      resolution: HISTOGRAM_RESOLUTION_MS,
    });
    this.histogram.enable();
    this.previousUtilization = performance.eventLoopUtilization();
    this.timer = setInterval(() => this.sample(), SAMPLE_INTERVAL_MS);
    this.timer.unref();
  }

  stop(): void {
    this.histogram?.disable();
    this.histogram = null;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  sample(): RuntimeHealthSample {
    const histogram = this.histogram;
    const utilization = performance.eventLoopUtilization(
      this.previousUtilization ?? undefined,
    );
    this.previousUtilization = performance.eventLoopUtilization();
    const memory = process.memoryUsage();

    const sample: RuntimeHealthSample = {
      lag_p50_ms: round((histogram?.percentile(50) ?? 0) / NS_PER_MS, 1),
      lag_p99_ms: round((histogram?.percentile(99) ?? 0) / NS_PER_MS, 1),
      lag_max_ms: round((histogram?.max ?? 0) / NS_PER_MS, 1),
      elu: round(utilization.utilization, 3),
      heap_used_mb: round(memory.heapUsed / MB, 1),
      rss_mb: round(memory.rss / MB, 1),
    };
    histogram?.reset();

    this.lastSample = sample;
    this.telemetry.capture({ name: 'runtime_health', properties: sample });
    if (sample.lag_p99_ms > LAG_WARN_P99_MS) {
      this.logger.warn(
        `Event loop lag p99=${sample.lag_p99_ms.toString()}ms max=${sample.lag_max_ms.toString()}ms over the last interval`,
      );
    }
    return sample;
  }
}
