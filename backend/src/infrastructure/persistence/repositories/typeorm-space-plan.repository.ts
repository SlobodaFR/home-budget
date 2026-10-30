import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FieldCipher } from '../../../domain/shared/field-cipher';
import { SpacePlan, SpacePlanProps } from '../../../domain/space/space-plan';
import { SpacePlanRepository } from '../../../domain/space/space-plan.repository';
import { SpaceOrmEntity } from '../entities/space.orm-entity';
import { SpacePlanOrmEntity } from '../entities/space-plan.orm-entity';

@Injectable()
export class TypeOrmSpacePlanRepository extends SpacePlanRepository {
  constructor(
    @InjectRepository(SpacePlanOrmEntity)
    private readonly plans: Repository<SpacePlanOrmEntity>,
    @InjectRepository(SpaceOrmEntity)
    private readonly spaces: Repository<SpaceOrmEntity>,
    private readonly cipher: FieldCipher,
  ) {
    super();
  }

  async find(spaceId: string): Promise<SpacePlan | null> {
    const row = await this.plans.findOne({ where: { spaceId } });
    if (!row) {
      return null;
    }
    const space = await this.spaces.findOneByOrFail({ id: spaceId });
    const json = space.ownerUserId
      ? this.cipher.decrypt(space.ownerUserId, aad(spaceId), row.payload)
      : row.payload;
    return SpacePlan.create(JSON.parse(json) as SpacePlanProps);
  }

  async save(spaceId: string, plan: SpacePlan): Promise<void> {
    const space = await this.spaces.findOneByOrFail({ id: spaceId });
    const json = JSON.stringify(plan.toProps());
    const payload = space.ownerUserId
      ? this.cipher.encrypt(space.ownerUserId, aad(spaceId), json)
      : json;
    await this.plans.save({ spaceId, payload });
  }
}

function aad(spaceId: string): string {
  return `plan:${spaceId}`;
}
