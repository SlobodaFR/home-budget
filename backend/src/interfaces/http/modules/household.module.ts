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
import {
  ExportDataUseCase,
  ExportTransactionsCsvUseCase,
} from '../../../application/export/export.use-cases';
import {
  GetReviewUseCase,
  ListReviewsUseCase,
  SaveReviewUseCase,
} from '../../../application/review/review.use-cases';
import { MonthReviewRepository } from '../../../domain/review/month-review.repository';
import { MonthReviewOrmEntity } from '../../../infrastructure/persistence/entities/month-review.orm-entity';
import { TypeOrmMonthReviewRepository } from '../../../infrastructure/persistence/repositories/typeorm-month-review.repository';
import { ExportController } from '../controllers/export.controller';
import { ReviewsController } from '../controllers/reviews.controller';
import { DebtViewsService } from '../../../application/debt/debt-views.service';
import {
  CreateDebtUseCase,
  DebtWhatIfUseCase,
  DeleteDebtUseCase,
  GetDebtsSummaryUseCase,
  ListDebtsUseCase,
  UpdateDebtUseCase,
} from '../../../application/debt/debt.use-cases';
import { DebtRepository } from '../../../domain/debt/debt.repository';
import { DebtOrmEntity } from '../../../infrastructure/persistence/entities/debt.orm-entity';
import { TypeOrmDebtRepository } from '../../../infrastructure/persistence/repositories/typeorm-debt.repository';
import { DebtsController } from '../controllers/debts.controller';
import { ProjectViewsService } from '../../../application/project/project-views.service';
import {
  AddDepositUseCase,
  CreateProjectUseCase,
  DeleteDepositUseCase,
  DeleteProjectUseCase,
  GetProjectsSummaryUseCase,
  ListDepositsUseCase,
  ListProjectsUseCase,
  UpdateProjectUseCase,
} from '../../../application/project/project.use-cases';
import { ProjectRepository } from '../../../domain/project/project.repository';
import { ProjectDepositOrmEntity } from '../../../infrastructure/persistence/entities/project-deposit.orm-entity';
import { ProjectOrmEntity } from '../../../infrastructure/persistence/entities/project.orm-entity';
import { TypeOrmProjectRepository } from '../../../infrastructure/persistence/repositories/typeorm-project.repository';
import { ProjectsController } from '../controllers/projects.controller';
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
      ProjectOrmEntity,
      ProjectDepositOrmEntity,
      MonthReviewOrmEntity,
      DebtOrmEntity,
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
    ProjectsController,
    ReviewsController,
    ExportController,
    DebtsController,
  ],
  providers: [
    { provide: FieldCipher, useClass: AesGcmFieldCipher },
    { provide: HouseholdRepository, useClass: TypeOrmHouseholdRepository },
    { provide: SpacePlanRepository, useClass: TypeOrmSpacePlanRepository },
    { provide: SpaceRulesRepository, useClass: TypeOrmSpaceRulesRepository },
    { provide: TransactionRepository, useClass: TypeOrmTransactionRepository },
    { provide: Clock, useClass: SystemClock },
    { provide: AccountRepository, useClass: TypeOrmAccountRepository },
    { provide: ProjectRepository, useClass: TypeOrmProjectRepository },
    { provide: DebtRepository, useClass: TypeOrmDebtRepository },
    { provide: MonthReviewRepository, useClass: TypeOrmMonthReviewRepository },
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
    ProjectViewsService,
    DebtViewsService,
    ListDebtsUseCase,
    GetDebtsSummaryUseCase,
    CreateDebtUseCase,
    UpdateDebtUseCase,
    DeleteDebtUseCase,
    DebtWhatIfUseCase,
    GetReviewUseCase,
    SaveReviewUseCase,
    ListReviewsUseCase,
    ExportDataUseCase,
    ExportTransactionsCsvUseCase,
    ListProjectsUseCase,
    GetProjectsSummaryUseCase,
    CreateProjectUseCase,
    UpdateProjectUseCase,
    DeleteProjectUseCase,
    ListDepositsUseCase,
    AddDepositUseCase,
    DeleteDepositUseCase,
    AccountAssignmentService,
    ListAccountsUseCase,
    CreateAccountUseCase,
    UpdateAccountUseCase,
    DeleteAccountUseCase,
  ],
})
export class HouseholdModule {}
