import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassificationRule } from '../../../domain/import/classification';
import { SpaceRulesRepository } from '../../../domain/import/space-rules.repository';
import { FieldCipher } from '../../../domain/shared/field-cipher';
import { SpaceRulesOrmEntity } from '../entities/space-rules.orm-entity';
import { SpaceOrmEntity } from '../entities/space.orm-entity';

@Injectable()
export class TypeOrmSpaceRulesRepository extends SpaceRulesRepository {
  constructor(
    @InjectRepository(SpaceRulesOrmEntity)
    private readonly rules: Repository<SpaceRulesOrmEntity>,
    @InjectRepository(SpaceOrmEntity)
    private readonly spaces: Repository<SpaceOrmEntity>,
    private readonly cipher: FieldCipher,
  ) {
    super();
  }

  async find(spaceId: string): Promise<ClassificationRule[] | null> {
    const row = await this.rules.findOne({ where: { spaceId } });
    if (!row) {
      return null;
    }
    const space = await this.spaces.findOneByOrFail({ id: spaceId });
    const json = space.ownerUserId
      ? this.cipher.decrypt(space.ownerUserId, aad(spaceId), row.payload)
      : row.payload;
    return JSON.parse(json) as ClassificationRule[];
  }

  async save(spaceId: string, rules: ClassificationRule[]): Promise<void> {
    const space = await this.spaces.findOneByOrFail({ id: spaceId });
    const json = JSON.stringify(rules);
    const payload = space.ownerUserId
      ? this.cipher.encrypt(space.ownerUserId, aad(spaceId), json)
      : json;
    await this.rules.save({ spaceId, payload });
  }
}

function aad(spaceId: string): string {
  return `rules:${spaceId}`;
}
