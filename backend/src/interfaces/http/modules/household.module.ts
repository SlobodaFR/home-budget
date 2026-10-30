import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GetContributionUseCase } from '../../../application/contribution/get-contribution.use-case';
import { CreateHouseholdUseCase } from '../../../application/household/create-household.use-case';
import { CreateInvitationUseCase } from '../../../application/household/create-invitation.use-case';
import { GetHouseholdUseCase } from '../../../application/household/get-household.use-case';
import { HouseholdViewBuilder } from '../../../application/household/household.dto';
import { JoinHouseholdUseCase } from '../../../application/household/join-household.use-case';
import { SpaceAccessService } from '../../../application/household/space-access.service';
import {
  SetContributionModeUseCase,
  SetMyIncomeUseCase,
} from '../../../application/household/update-household-settings.use-case';
import {
  GetSpacePlanUseCase,
  SaveSpacePlanUseCase,
} from '../../../application/space/space-plan.use-cases';
import {
  CreateSpaceTransactionUseCase,
  DeleteSpaceTransactionUseCase,
  GetMonthSummaryUseCase,
  ListSpaceTransactionsUseCase,
  UpdateSpaceTransactionUseCase,
} from '../../../application/space/space-transaction.use-cases';
import { HouseholdRepository } from '../../../domain/household/household.repository';
import { FieldCipher } from '../../../domain/shared/field-cipher';
import { SpacePlanRepository } from '../../../domain/space/space-plan.repository';
import { TransactionRepository } from '../../../domain/transaction/transaction.repository';
import { AesGcmFieldCipher } from '../../../infrastructure/crypto/aes-gcm-field-cipher';
import { SpacePlanOrmEntity } from '../../../infrastructure/persistence/entities/space-plan.orm-entity';
import { SpaceOrmEntity } from '../../../infrastructure/persistence/entities/space.orm-entity';
import { TransactionOrmEntity } from '../../../infrastructure/persistence/entities/transaction.orm-entity';
import { TypeOrmHouseholdRepository } from '../../../infrastructure/persistence/repositories/typeorm-household.repository';
import { TypeOrmSpacePlanRepository } from '../../../infrastructure/persistence/repositories/typeorm-space-plan.repository';
import { TypeOrmTransactionRepository } from '../../../infrastructure/persistence/repositories/typeorm-transaction.repository';
import { HouseholdController } from '../controllers/household.controller';
import { SpacesController } from '../controllers/spaces.controller';
import { DomainErrorFilter } from '../domain-error.filter';
import { AuthModule } from './auth.module';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      SpaceOrmEntity,
      SpacePlanOrmEntity,
      TransactionOrmEntity,
    ]),
  ],
  controllers: [HouseholdController, SpacesController],
  providers: [
    { provide: FieldCipher, useClass: AesGcmFieldCipher },
    { provide: HouseholdRepository, useClass: TypeOrmHouseholdRepository },
    { provide: SpacePlanRepository, useClass: TypeOrmSpacePlanRepository },
    { provide: TransactionRepository, useClass: TypeOrmTransactionRepository },
    { provide: APP_FILTER, useClass: DomainErrorFilter },
    HouseholdViewBuilder,
    SpaceAccessService,
    GetHouseholdUseCase,
    CreateHouseholdUseCase,
    CreateInvitationUseCase,
    JoinHouseholdUseCase,
    SetMyIncomeUseCase,
    SetContributionModeUseCase,
    GetContributionUseCase,
    GetSpacePlanUseCase,
    SaveSpacePlanUseCase,
    ListSpaceTransactionsUseCase,
    CreateSpaceTransactionUseCase,
    UpdateSpaceTransactionUseCase,
    DeleteSpaceTransactionUseCase,
    GetMonthSummaryUseCase,
  ],
})
export class HouseholdModule {}
