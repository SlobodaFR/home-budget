import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreateAccountUseCase } from '../../../application/account/create-account.use-case';
import { DeleteAccountUseCase } from '../../../application/account/delete-account.use-case';
import { GetEquitySummaryUseCase } from '../../../application/account/get-equity-summary.use-case';
import { ListAccountsWithBalancesUseCase } from '../../../application/account/list-accounts-with-balances.use-case';
import { UpdateAccountUseCase } from '../../../application/account/update-account.use-case';
import { AccountRepository } from '../../../domain/account/account.repository';
import { TransactionRepository } from '../../../domain/transaction/transaction.repository';
import { AccountOrmEntity } from '../../../infrastructure/persistence/entities/account.orm-entity';
import { TransactionOrmEntity } from '../../../infrastructure/persistence/entities/transaction.orm-entity';
import { TypeOrmAccountRepository } from '../../../infrastructure/persistence/repositories/typeorm-account.repository';
import { TypeOrmTransactionRepository } from '../../../infrastructure/persistence/repositories/typeorm-transaction.repository';
import { AccountsController } from '../controllers/accounts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AccountOrmEntity, TransactionOrmEntity])],
  controllers: [AccountsController],
  providers: [
    { provide: AccountRepository, useClass: TypeOrmAccountRepository },
    { provide: TransactionRepository, useClass: TypeOrmTransactionRepository },
    ListAccountsWithBalancesUseCase,
    GetEquitySummaryUseCase,
    CreateAccountUseCase,
    UpdateAccountUseCase,
    DeleteAccountUseCase,
  ],
  exports: [AccountRepository, TransactionRepository],
})
export class AccountModule {}
