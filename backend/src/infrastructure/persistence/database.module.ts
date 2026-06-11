import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountOrmEntity } from './entities/account.orm-entity';
import { RecurringTransactionOrmEntity } from './entities/recurring-transaction.orm-entity';
import { RevokedSessionOrmEntity } from './entities/revoked-session.orm-entity';
import { TransactionOrmEntity } from './entities/transaction.orm-entity';
import { UserOrmEntity } from './entities/user.orm-entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'better-sqlite3',
        database: config.get<string>('DATABASE_PATH', 'data/budget.sqlite'),
        // WAL mode is required for Litestream replication.
        enableWAL: true,
        entities: [
          AccountOrmEntity,
          TransactionOrmEntity,
          UserOrmEntity,
          RecurringTransactionOrmEntity,
          RevokedSessionOrmEntity,
        ],
        synchronize: true,
        autoLoadEntities: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
