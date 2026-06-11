import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from '../../../domain/account/account';
import { AccountRepository } from '../../../domain/account/account.repository';
import { Money } from '../../../domain/shared/money';
import { AccountOrmEntity } from '../entities/account.orm-entity';
import { TransactionOrmEntity } from '../entities/transaction.orm-entity';

@Injectable()
export class TypeOrmAccountRepository extends AccountRepository {
  constructor(
    @InjectRepository(AccountOrmEntity)
    private readonly repository: Repository<AccountOrmEntity>,
    @InjectRepository(TransactionOrmEntity)
    private readonly transactionRepository: Repository<TransactionOrmEntity>,
  ) {
    super();
  }

  async findAll(userId: string): Promise<Account[]> {
    const rows = await this.repository.find({ where: { userId } });
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<Account | null> {
    const row = await this.repository.findOne({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async save(account: Account): Promise<void> {
    await this.repository.save({
      id: account.id,
      userId: account.userId,
      name: account.name,
      type: account.type,
      icon: account.icon,
      monthlyBudgetCents: account.monthlyBudget?.toCents() ?? null,
    });
  }

  async delete(id: string): Promise<void> {
    await this.transactionRepository.delete({ accountId: id });
    await this.repository.delete({ id });
  }
}

function toDomain(row: AccountOrmEntity): Account {
  return Account.create({
    id: row.id,
    userId: row.userId,
    name: row.name,
    type: row.type,
    icon: row.icon,
    monthlyBudget: row.monthlyBudgetCents === null ? null : Money.fromCents(row.monthlyBudgetCents),
  });
}
