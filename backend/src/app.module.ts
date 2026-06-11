import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule } from './infrastructure/persistence/database.module';
import { AccountOrmEntity } from './infrastructure/persistence/entities/account.orm-entity';
import { TransactionOrmEntity } from './infrastructure/persistence/entities/transaction.orm-entity';
import { TypeOrmAccountRepository } from './infrastructure/persistence/repositories/typeorm-account.repository';
import { TypeOrmTransactionRepository } from './infrastructure/persistence/repositories/typeorm-transaction.repository';
import { AccountRepository } from './domain/account/account.repository';
import { TransactionRepository } from './domain/transaction/transaction.repository';
import { AccountModule } from './interfaces/http/modules/account.module';
import { AuthModule } from './interfaces/http/modules/auth.module';
import { RecurringTransactionModule } from './interfaces/http/modules/recurring-transaction.module';
import { TransactionModule } from './interfaces/http/modules/transaction.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    TypeOrmModule.forFeature([AccountOrmEntity, TransactionOrmEntity]),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, 'public'),
      exclude: ['/api*'],
    }),
    AuthModule,
    AccountModule,
    TransactionModule,
    RecurringTransactionModule,
  ],
  providers: [
    { provide: AccountRepository, useClass: TypeOrmAccountRepository },
    { provide: TransactionRepository, useClass: TypeOrmTransactionRepository },
  ],
})
export class AppModule {}
