import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreateTransactionUseCase } from '../../../application/transaction/create-transaction.use-case';
import { DeleteTransactionUseCase } from '../../../application/transaction/delete-transaction.use-case';
import { ListRecentTransactionsUseCase } from '../../../application/transaction/list-recent-transactions.use-case';
import { UpdateTransactionUseCase } from '../../../application/transaction/update-transaction.use-case';
import { AccountRepository } from '../../../domain/account/account.repository';
import { TransactionRepository } from '../../../domain/transaction/transaction.repository';
import { AccountOrmEntity } from '../../../infrastructure/persistence/entities/account.orm-entity';
import { TransactionOrmEntity } from '../../../infrastructure/persistence/entities/transaction.orm-entity';
import { TypeOrmAccountRepository } from '../../../infrastructure/persistence/repositories/typeorm-account.repository';
import { TypeOrmTransactionRepository } from '../../../infrastructure/persistence/repositories/typeorm-transaction.repository';
import { TransactionsController } from '../controllers/transactions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AccountOrmEntity, TransactionOrmEntity])],
  controllers: [TransactionsController],
  providers: [
    { provide: AccountRepository, useClass: TypeOrmAccountRepository },
    { provide: TransactionRepository, useClass: TypeOrmTransactionRepository },
    ListRecentTransactionsUseCase,
    CreateTransactionUseCase,
    UpdateTransactionUseCase,
    DeleteTransactionUseCase,
  ],
})
export class TransactionModule {}
