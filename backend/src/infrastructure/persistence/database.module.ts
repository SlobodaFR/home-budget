import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HouseholdOrmEntity } from './entities/household.orm-entity';
import { AccountOrmEntity } from './entities/account.orm-entity';
import { HouseholdFiscalProfileOrmEntity } from './entities/household-fiscal-profile.orm-entity';
import { InvitationOrmEntity } from './entities/invitation.orm-entity';
import { MembershipOrmEntity } from './entities/membership.orm-entity';
import { MonthReviewOrmEntity } from './entities/month-review.orm-entity';
import { ProjectDepositOrmEntity } from './entities/project-deposit.orm-entity';
import { ProjectOrmEntity } from './entities/project.orm-entity';
import { RecurringItemOrmEntity } from './entities/recurring-item.orm-entity';
import { RevokedSessionOrmEntity } from './entities/revoked-session.orm-entity';
import { SafetyNetOrmEntity } from './entities/safety-net.orm-entity';
import { SpacePlanOrmEntity } from './entities/space-plan.orm-entity';
import { SpaceRulesOrmEntity } from './entities/space-rules.orm-entity';
import { SpaceOrmEntity } from './entities/space.orm-entity';
import { TransactionOrmEntity } from './entities/transaction.orm-entity';
import { UserOrmEntity } from './entities/user.orm-entity';
import { MIGRATIONS } from './migrations';

export const ORM_ENTITIES = [
  UserOrmEntity,
  RevokedSessionOrmEntity,
  HouseholdOrmEntity,
  MembershipOrmEntity,
  InvitationOrmEntity,
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
];

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'better-sqlite3' as const,
        database: config.get<string>('DATABASE_PATH', 'data/budget.sqlite'),
        // WAL mode is required for Litestream replication.
        enableWAL: true,
        entities: ORM_ENTITIES,
        // Le schema evolue par migrations uniquement : jamais de synchronize.
        synchronize: false,
        migrationsRun: true,
        migrations: MIGRATIONS,
      }),
    }),
  ],
})
export class DatabaseModule {}
