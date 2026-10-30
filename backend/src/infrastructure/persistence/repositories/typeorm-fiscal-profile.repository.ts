import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FiscalProfile } from '../../../domain/aid/fiscal-profile';
import { FiscalProfileRepository } from '../../../domain/aid/fiscal-profile.repository';
import { HouseholdFiscalProfileOrmEntity } from '../entities/household-fiscal-profile.orm-entity';

@Injectable()
export class TypeOrmFiscalProfileRepository extends FiscalProfileRepository {
  constructor(
    @InjectRepository(HouseholdFiscalProfileOrmEntity)
    private readonly profiles: Repository<HouseholdFiscalProfileOrmEntity>,
  ) {
    super();
  }

  async find(householdId: string): Promise<FiscalProfile | null> {
    const row = await this.profiles.findOne({ where: { householdId } });
    return row
      ? FiscalProfile.create({
          childrenUnderSix: row.childrenUnderSix,
          dependentChildren: row.dependentChildren,
          firstYearHomeServices: Boolean(row.firstYearHomeServices),
        })
      : null;
  }

  async save(householdId: string, profile: FiscalProfile): Promise<void> {
    await this.profiles.save({ householdId, ...profile.toProps() });
  }
}
