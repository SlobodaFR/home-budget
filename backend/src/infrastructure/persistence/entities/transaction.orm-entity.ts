import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { TransactionCategory } from '../../../domain/transaction/transaction-category';
import { AccountOrmEntity } from './account.orm-entity';

@Entity({ name: 'transactions' })
export class TransactionOrmEntity {
  @PrimaryColumn('text')
  id!: string;

  @Index()
  @Column({ type: 'text', name: 'account_id' })
  accountId!: string;

  @ManyToOne(() => AccountOrmEntity, (account) => account.transactions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'account_id' })
  account!: AccountOrmEntity;

  @Column('text')
  label!: string;

  @Column('text')
  category!: TransactionCategory;

  @Column({ type: 'integer', name: 'amount_cents' })
  amountCents!: number;

  @Column({ type: 'datetime' })
  date!: Date;
}
