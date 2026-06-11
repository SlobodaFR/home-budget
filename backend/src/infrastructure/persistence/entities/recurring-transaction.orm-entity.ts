import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { TransactionCategory } from '../../../domain/transaction/transaction-category';

@Entity({ name: 'recurring_transactions' })
export class RecurringTransactionOrmEntity {
  @PrimaryColumn('text')
  id!: string;

  @Index()
  @Column({ type: 'text', name: 'account_id' })
  accountId!: string;

  @Column('text')
  label!: string;

  @Column('text')
  category!: TransactionCategory;

  @Column({ type: 'integer', name: 'amount_cents' })
  amountCents!: number;

  @Column({ type: 'integer', name: 'day_of_month', nullable: true })
  dayOfMonth!: number | null;

  @Column({ type: 'datetime', name: 'start_date' })
  startDate!: Date;

  @Column({ type: 'datetime', name: 'end_date', nullable: true })
  endDate!: Date | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;
}
