import { Injectable } from '@nestjs/common';
import { buildProvisions } from '../../domain/budget/provisions';
import {
  buildYearForecast,
  YearForecast,
} from '../../domain/budget/year-forecast';
import { RecurringItemRepository } from '../../domain/recurring/recurring-item.repository';
import { parseIsoDate } from '../../domain/shared/calendar';
import { Clock } from '../../domain/shared/clock';
import { SpacePlan } from '../../domain/space/space-plan';
import { SpacePlanRepository } from '../../domain/space/space-plan.repository';
import { SpaceAccessService } from '../household/space-access.service';
import { ProvisionsDto, toProvisionsDto } from './provision.dto';

/** Dépenses non mensuelles actives de l'espace et provision mensuelle pour les lisser. */
@Injectable()
export class GetProvisionsUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly recurring: RecurringItemRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    asOf?: string,
  ): Promise<ProvisionsDto> {
    await this.access.requireSpace(userId, spaceId);
    const reference = asOf ? parseIsoDate(asOf, 'asOf') : this.clock.now();
    const items = await this.recurring.findBySpace(spaceId);
    return toProvisionsDto(buildProvisions(items, reference));
  }
}

/** Les 12 mois d'une année vus à travers les seuls paiements récurrents. */
@Injectable()
export class GetYearForecastUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly plans: SpacePlanRepository,
    private readonly recurring: RecurringItemRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    year?: number,
  ): Promise<YearForecast> {
    const space = await this.access.requireSpace(userId, spaceId);
    const today = this.clock.now();
    const [plan, items] = await Promise.all([
      this.plans.find(spaceId),
      this.recurring.findBySpace(spaceId),
    ]);
    return buildYearForecast({
      year: year ?? today.getUTCFullYear(),
      recurring: items,
      plan: plan ?? SpacePlan.empty(),
      commonSpace: !space.isPersonal(),
      today,
    });
  }
}
