import { Injectable } from '@nestjs/common';
import { SpacePlan, SpacePlanProps } from '../../domain/space/space-plan';
import { SpacePlanRepository } from '../../domain/space/space-plan.repository';
import { SpaceAccessService } from '../household/space-access.service';

@Injectable()
export class GetSpacePlanUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly plans: SpacePlanRepository,
  ) {}

  async execute(userId: string, spaceId: string): Promise<SpacePlanProps> {
    await this.access.requireSpace(userId, spaceId);
    return ((await this.plans.find(spaceId)) ?? SpacePlan.empty()).toProps();
  }
}

@Injectable()
export class SaveSpacePlanUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly plans: SpacePlanRepository,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    props: SpacePlanProps,
  ): Promise<void> {
    await this.access.requireSpace(userId, spaceId);
    await this.plans.save(spaceId, SpacePlan.create(props));
  }
}
