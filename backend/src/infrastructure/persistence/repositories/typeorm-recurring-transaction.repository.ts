import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Money } from '../../../domain/shared/money';
import { RecurringTransaction } from '../../../domain/recurring-transaction/recurring-transaction';
import { RecurringTransactionRepository } from '../../../domain/recurring-transaction/recurring-transaction.repository';
import { RecurringTransactionOrmEntity } from '../entities/recurring-transaction.orm-entity';

@Injectable()
export class TypeOrmRecurringTransactionRepository extends RecurringTransactionRepository {
  constructor(
    @InjectRepository(RecurringTransactionOrmEntity)
    private readonly repository: Repository<RecurringTransactionOrmEntity>,
  ) {
    super();
  }

  async findAll(userId: string): Promise<RecurringTransaction[]> {
    const rows = await this.repository
      .createQueryBuilder('recurring')
      .innerJoin('accounts', 'account', 'account.id = recurring.account_id')
      .where('account.user_id = :userId', { userId })
      .orderBy('recurring.start_date', 'ASC')
      .getMany();

    return rows.map(toDomain);
  }

  async findById(id: string): Promise<RecurringTransaction | null> {
    const row = await this.repository.findOne({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async save(recurringTransaction: RecurringTransaction): Promise<void> {
    await this.repository.save({
      id: recurringTransaction.id,
      accountId: recurringTransaction.accountId,
      label: recurringTransaction.label,
      category: recurringTransaction.category,
      amountCents: recurringTransaction.amount.toCents(),
      dayOfMonth: recurringTransaction.dayOfMonth,
      startDate: recurringTransaction.startDate,
      endDate: recurringTransaction.endDate,
      active: recurringTransaction.active,
    });
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete({ id });
  }
}

function toDomain(row: RecurringTransactionOrmEntity): RecurringTransaction {
  return RecurringTransaction.create({
    id: row.id,
    accountId: row.accountId,
    label: row.label,
    category: row.category,
    amount: Money.fromCents(row.amountCents),
    dayOfMonth: row.dayOfMonth,
    startDate: new Date(row.startDate),
    endDate: row.endDate ? new Date(row.endDate) : null,
    active: row.active,
  });
}
