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
import {
  CommitImportUseCase,
  GetRulesUseCase,
  PreviewImportUseCase,
  SaveRulesUseCase,
} from '../../../application/import/import.use-cases';
import { SpaceRulesRepository } from '../../../domain/import/space-rules.repository';
import { SpaceRulesOrmEntity } from '../../../infrastructure/persistence/entities/space-rules.orm-entity';
import { TypeOrmSpaceRulesRepository } from '../../../infrastructure/persistence/repositories/typeorm-space-rules.repository';
import {
  EstimateCrecheUseCase,
  GetAidsUseCase,
  GetFiscalProfileUseCase,
  ListAidRulesUseCase,
  SaveFiscalProfileUseCase,
} from '../../../application/aid/aid.use-cases';
import { AccountAssignmentService } from '../../../application/account/account-assignment.service';
import { AccountViewsService } from '../../../application/account/account-views.service';
import {
  CreateAccountUseCase,
  DeleteAccountUseCase,
  ListAccountsUseCase,
  UpdateAccountUseCase,
} from '../../../application/account/account.use-cases';
import { AccountRepository } from '../../../domain/account/account.repository';
import { AccountOrmEntity } from '../../../infrastructure/persistence/entities/account.orm-entity';
import { TypeOrmAccountRepository } from '../../../infrastructure/persistence/repositories/typeorm-account.repository';
import { AccountsController } from '../controllers/accounts.controller';
import {
  GetProvisionsUseCase,
  GetYearForecastUseCase,
} from '../../../application/provision/provision.use-cases';
import { GetForecastUseCase } from '../../../application/forecast/get-forecast.use-case';
import { GetInsightsUseCase } from '../../../application/insights/get-insights.use-case';
import {
  CreateRecurringItemUseCase,
  DeleteRecurringItemUseCase,
  ListRecurringItemsUseCase,
  UpdateRecurringItemUseCase,
} from '../../../application/recurring/recurring.use-cases';
import { SafetyNetProgressService } from '../../../application/safety-net/safety-net-progress.service';
import {
  GetSafetyNetUseCase,
  SaveSafetyNetUseCase,
} from '../../../application/safety-net/safety-net.use-cases';
import { FiscalProfileRepository } from '../../../domain/aid/fiscal-profile.repository';
import { RecurringItemRepository } from '../../../domain/recurring/recurring-item.repository';
import { SafetyNetRepository } from '../../../domain/safety-net/safety-net.repository';
import { Clock } from '../../../domain/shared/clock';
import { HouseholdFiscalProfileOrmEntity } from '../../../infrastructure/persistence/entities/household-fiscal-profile.orm-entity';
import { RecurringItemOrmEntity } from '../../../infrastructure/persistence/entities/recurring-item.orm-entity';
import { SafetyNetOrmEntity } from '../../../infrastructure/persistence/entities/safety-net.orm-entity';
import { TypeOrmFiscalProfileRepository } from '../../../infrastructure/persistence/repositories/typeorm-fiscal-profile.repository';
import { TypeOrmRecurringItemRepository } from '../../../infrastructure/persistence/repositories/typeorm-recurring-item.repository';
import { TypeOrmSafetyNetRepository } from '../../../infrastructure/persistence/repositories/typeorm-safety-net.repository';
import { SystemClock } from '../../../infrastructure/time/system-clock';
import { AidRulesController } from '../controllers/aid-rules.controller';
import { GuidanceController } from '../controllers/guidance.controller';
import { HouseholdGuidanceController } from '../controllers/household-guidance.controller';
import { RecurringController } from '../controllers/recurring.controller';
import { ImportsController } from '../controllers/imports.controller';
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
      SpaceRulesOrmEntity,
      TransactionOrmEntity,
      RecurringItemOrmEntity,
      SafetyNetOrmEntity,
      HouseholdFiscalProfileOrmEntity,
      AccountOrmEntity,
    ]),
  ],
  controllers: [
    HouseholdController,
    SpacesController,
    ImportsController,
    RecurringController,
    GuidanceController,
    HouseholdGuidanceController,
    AidRulesController,
    AccountsController,
  ],
  providers: [
    { provide: FieldCipher, useClass: AesGcmFieldCipher },
    { provide: HouseholdRepository, useClass: TypeOrmHouseholdRepository },
    { provide: SpacePlanRepository, useClass: TypeOrmSpacePlanRepository },
    { provide: SpaceRulesRepository, useClass: TypeOrmSpaceRulesRepository },
    { provide: TransactionRepository, useClass: TypeOrmTransactionRepository },
    { provide: Clock, useClass: SystemClock },
    { provide: AccountRepository, useClass: TypeOrmAccountRepository },
    {
      provide: RecurringItemRepository,
      useClass: TypeOrmRecurringItemRepository,
    },
    { provide: SafetyNetRepository, useClass: TypeOrmSafetyNetRepository },
    {
      provide: FiscalProfileRepository,
      useClass: TypeOrmFiscalProfileRepository,
    },
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
    PreviewImportUseCase,
    CommitImportUseCase,
    GetRulesUseCase,
    SaveRulesUseCase,
    ListRecurringItemsUseCase,
    CreateRecurringItemUseCase,
    UpdateRecurringItemUseCase,
    DeleteRecurringItemUseCase,
    GetForecastUseCase,
    GetInsightsUseCase,
    SafetyNetProgressService,
    GetSafetyNetUseCase,
    SaveSafetyNetUseCase,
    GetFiscalProfileUseCase,
    SaveFiscalProfileUseCase,
    GetAidsUseCase,
    ListAidRulesUseCase,
    EstimateCrecheUseCase,
    AccountViewsService,
    GetProvisionsUseCase,
    GetYearForecastUseCase,
    AccountAssignmentService,
    ListAccountsUseCase,
    CreateAccountUseCase,
    UpdateAccountUseCase,
    DeleteAccountUseCase,
  ],
})
export class HouseholdModule {}
