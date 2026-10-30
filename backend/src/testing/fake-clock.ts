import { Clock } from '../domain/shared/clock';

/** Horloge de test : fixe jusqu'à ce qu'on la déplace. */
export class FakeClock extends Clock {
  constructor(private current: Date) {
    super();
  }

  static at(iso: string): FakeClock {
    return new FakeClock(new Date(iso));
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  set(iso: string): void {
    this.current = new Date(iso);
  }
}
