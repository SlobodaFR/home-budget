import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Money } from '../../../domain/shared/money';
import { Transaction } from '../../../domain/transaction/transaction';
import { TransactionRepository } from '../../../domain/transaction/transaction.repository';
import { TransactionOrmEntity } from '../entities/transaction.orm-entity';

@Injectable()
export class TypeOrmTransactionRepository extends TransactionRepository {
  constructor(
    @InjectRepository(TransactionOrmEntity)
    private readonly repository: Repository<TransactionOrmEntity>,
  ) {
    super();
  }

  async findAll(limit?: number, userId?: string): Promise<Transaction[]> {
    if (!userId) {
      const rows = await this.repository.find({ order: { date: 'DESC' }, take: limit });
      return rows.map(toDomain);
    }

    const query = this.repository
      .createQueryBuilder('transaction')
      .innerJoin('accounts', 'account', 'account.id = transaction.account_id')
      .where('account.user_id = :userId', { userId })
      .orderBy('transaction.date', 'DESC');

    if (limit) {
      query.take(limit);
    }

    const rows = await query.getMany();
    return rows.map(toDomain);
  }

  async findByAccountId(accountId: string): Promise<Transaction[]> {
    const rows = await this.repository.find({ where: { accountId } });
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<Transaction | null> {
    const row = await this.repository.findOne({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async save(transaction: Transaction): Promise<void> {
    await this.repository.save({
      id: transaction.id,
      accountId: transaction.accountId,
      label: transaction.label,
      category: transaction.category,
      amountCents: transaction.amount.toCents(),
      date: transaction.date,
    });
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete({ id });
  }
}

function toDomain(row: TransactionOrmEntity): Transaction {
  return Transaction.create({
    id: row.id,
    accountId: row.accountId,
    label: row.label,
    category: row.category,
    amount: Money.fromCents(row.amountCents),
    date: new Date(row.date),
  });
}
