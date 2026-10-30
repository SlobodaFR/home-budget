import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SafetyNet } from '../../../domain/safety-net/safety-net';
import { SafetyNetRepository } from '../../../domain/safety-net/safety-net.repository';
import { SafetyNetOrmEntity } from '../entities/safety-net.orm-entity';

@Injectable()
export class TypeOrmSafetyNetRepository extends SafetyNetRepository {
  constructor(
    @InjectRepository(SafetyNetOrmEntity)
    private readonly nets: Repository<SafetyNetOrmEntity>,
  ) {
    super();
  }

  async find(householdId: string): Promise<SafetyNet | null> {
    const row = await this.nets.findOne({ where: { householdId } });
    return row
      ? SafetyNet.create({
          savedCents: row.savedCents,
          asOf: row.asOf,
          targetMonths: row.targetMonths,
        })
      : null;
  }

  async save(householdId: string, safetyNet: SafetyNet): Promise<void> {
    await this.nets.save({ householdId, ...safetyNet.toProps() });
  }
}
