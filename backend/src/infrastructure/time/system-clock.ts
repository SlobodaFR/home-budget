import { Injectable } from '@nestjs/common';
import { Clock } from '../../domain/shared/clock';

/** Horloge réelle. */
@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
