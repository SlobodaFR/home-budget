import { Column, Entity, Index, OneToMany, PrimaryColumn } from 'typeorm';
import { AccountType } from '../../../domain/account/account-type.enum';
import { TransactionOrmEntity } from './transaction.orm-entity';

@Entity({ name: 'accounts' })
export class AccountOrmEntity {
  @PrimaryColumn('text')
  id!: string;

  @Index()
  @Column({ type: 'text', name: 'user_id' })
  userId!: string;

  @Column('text')
  name!: string;

  @Column({ type: 'text' })
  type!: AccountType;

  @Column('text')
  icon!: string;

  @Column({ type: 'integer', nullable: true, name: 'monthly_budget_cents' })
  monthlyBudgetCents!: number | null;

  @OneToMany(() => TransactionOrmEntity, (transaction) => transaction.account)
  transactions!: TransactionOrmEntity[];
}
