import { Telemetry, TelemetryEvent } from '../domain/shared/telemetry';

/** Enregistre les événements capturés (tests). */
export class SpyTelemetry extends Telemetry {
  readonly captured: Array<{ event: TelemetryEvent; userId?: string }> = [];

  capture(event: TelemetryEvent, userId?: string): void {
    this.captured.push({ event, userId });
  }
}
