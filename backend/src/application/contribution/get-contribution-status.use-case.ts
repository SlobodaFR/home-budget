import { Injectable } from '@nestjs/common';
import { currentMonth, parseMonth } from '../../domain/budget/month';
import { Clock } from '../../domain/shared/clock';
import {
  ContributionStatusDto,
  ContributionStatusService,
} from './contribution-status.service';

/** Contributions du mois : visible par tous les membres (information du commun). */
@Injectable()
export class GetContributionStatusUseCase {
  constructor(
    private readonly status: ContributionStatusService,
    private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    month?: string,
  ): Promise<ContributionStatusDto> {
    const wanted = month ?? currentMonth(this.clock.now());
    parseMonth(wanted);
    return this.status.forMonth(userId, wanted);
  }
}
