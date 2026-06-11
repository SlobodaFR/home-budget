import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreateRecurringTransactionUseCase } from '../../../application/recurring-transaction/create-recurring-transaction.use-case';
import { DeleteRecurringTransactionUseCase } from '../../../application/recurring-transaction/delete-recurring-transaction.use-case';
import { ListRecurringTransactionsUseCase } from '../../../application/recurring-transaction/list-recurring-transactions.use-case';
import { UpdateRecurringTransactionUseCase } from '../../../application/recurring-transaction/update-recurring-transaction.use-case';
import { GetBalanceForecastUseCase } from '../../../application/forecast/get-balance-forecast.use-case';
import { AccountRepository } from '../../../domain/account/account.repository';
import { RecurringTransactionRepository } from '../../../domain/recurring-transaction/recurring-transaction.repository';
import { TransactionRepository } from '../../../domain/transaction/transaction.repository';
import { AccountOrmEntity } from '../../../infrastructure/persistence/entities/account.orm-entity';
import { RecurringTransactionOrmEntity } from '../../../infrastructure/persistence/entities/recurring-transaction.orm-entity';
import { TransactionOrmEntity } from '../../../infrastructure/persistence/entities/transaction.orm-entity';
import { TypeOrmAccountRepository } from '../../../infrastructure/persistence/repositories/typeorm-account.repository';
import { TypeOrmRecurringTransactionRepository } from '../../../infrastructure/persistence/repositories/typeorm-recurring-transaction.repository';
import { TypeOrmTransactionRepository } from '../../../infrastructure/persistence/repositories/typeorm-transaction.repository';
import { RecurringTransactionsController } from '../controllers/recurring-transactions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AccountOrmEntity, TransactionOrmEntity, RecurringTransactionOrmEntity])],
  controllers: [RecurringTransactionsController],
  providers: [
    { provide: AccountRepository, useClass: TypeOrmAccountRepository },
    { provide: TransactionRepository, useClass: TypeOrmTransactionRepository },
    { provide: RecurringTransactionRepository, useClass: TypeOrmRecurringTransactionRepository },
    ListRecurringTransactionsUseCase,
    CreateRecurringTransactionUseCase,
    UpdateRecurringTransactionUseCase,
    DeleteRecurringTransactionUseCase,
    GetBalanceForecastUseCase,
  ],
})
export class RecurringTransactionModule {}
