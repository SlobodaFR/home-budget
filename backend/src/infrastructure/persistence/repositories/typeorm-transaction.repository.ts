import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bloc } from '../../../domain/shared/bloc';
import { FieldCipher } from '../../../domain/shared/field-cipher';
import { Money } from '../../../domain/shared/money';
import {
  Transaction,
  TransactionKind,
} from '../../../domain/transaction/transaction';
import { TransactionRepository } from '../../../domain/transaction/transaction.repository';
import { SpaceOrmEntity } from '../entities/space.orm-entity';
import { TransactionOrmEntity } from '../entities/transaction.orm-entity';

interface SecretPayload {
  label: string;
  amountCents: number;
}

/**
 * Espace commun : libelle et montant en clair. Espace personnel : ils sont
 * chiffres (cle du proprietaire) ; date, bloc et type restent en clair pour
 * permettre le filtrage par mois.
 */
@Injectable()
export class TypeOrmTransactionRepository extends TransactionRepository {
  constructor(
    @InjectRepository(TransactionOrmEntity)
    private readonly transactions: Repository<TransactionOrmEntity>,
    @InjectRepository(SpaceOrmEntity)
    private readonly spaces: Repository<SpaceOrmEntity>,
    private readonly cipher: FieldCipher,
  ) {
    super();
  }

  async findBySpaceAndPeriod(
    spaceId: string,
    from: Date,
    to: Date,
  ): Promise<Transaction[]> {
    const space = await this.spaces.findOneByOrFail({ id: spaceId });
    const rows = await this.transactions
      .createQueryBuilder('t')
      .where('t.space_id = :spaceId', { spaceId })
      .andWhere('t.date >= :from AND t.date < :to', {
        from: from.toISOString(),
        to: to.toISOString(),
      })
      .orderBy('t.date', 'DESC')
      .addOrderBy('t.id', 'DESC')
      .getMany();
    return rows.map((row) => this.toDomain(row, space.ownerUserId));
  }

  async findBySpaceFrom(spaceId: string, from: Date): Promise<Transaction[]> {
    const space = await this.spaces.findOneByOrFail({ id: spaceId });
    const rows = await this.transactions
      .createQueryBuilder('t')
      .where('t.space_id = :spaceId', { spaceId })
      .andWhere('t.date >= :from', { from: from.toISOString() })
      .orderBy('t.date', 'ASC')
      .addOrderBy('t.id', 'ASC')
      .getMany();
    return rows.map((row) => this.toDomain(row, space.ownerUserId));
  }

  async findLatestDate(spaceId: string): Promise<Date | null> {
    const row = await this.transactions
      .createQueryBuilder('t')
      .select('MAX(t.date)', 'latest')
      .where('t.space_id = :spaceId', { spaceId })
      .getRawOne<{ latest: string | null }>();
    return row?.latest ? new Date(row.latest) : null;
  }

  async findById(id: string): Promise<Transaction | null> {
    const row = await this.transactions.findOne({ where: { id } });
    if (!row) {
      return null;
    }
    const space = await this.spaces.findOneByOrFail({ id: row.spaceId });
    return this.toDomain(row, space.ownerUserId);
  }

  async save(transaction: Transaction): Promise<void> {
    await this.transactions.save(await this.toRow(transaction));
  }

  async saveMany(transactions: Transaction[]): Promise<void> {
    if (transactions.length === 0) {
      return;
    }
    const rows: TransactionOrmEntity[] = [];
    for (const transaction of transactions) {
      rows.push(await this.toRow(transaction));
    }
    await this.transactions.manager.transaction(async (manager) => {
      await manager.save(TransactionOrmEntity, rows);
    });
  }

  private async toRow(transaction: Transaction): Promise<TransactionOrmEntity> {
    const space = await this.spaces.findOneByOrFail({
      id: transaction.spaceId,
    });
    const base = {
      id: transaction.id,
      spaceId: transaction.spaceId,
      kind: transaction.kind,
      bloc: transaction.bloc,
      date: transaction.date.toISOString(),
    };

    if (space.ownerUserId) {
      const secret: SecretPayload = {
        label: transaction.label,
        amountCents: transaction.amount.toCents(),
      };
      return {
        ...base,
        label: null,
        amountCents: null,
        secretPayload: this.cipher.encrypt(
          space.ownerUserId,
          aad(transaction.id, transaction.spaceId),
          JSON.stringify(secret),
        ),
      };
    }

    return {
      ...base,
      label: transaction.label,
      amountCents: transaction.amount.toCents(),
      secretPayload: null,
    };
  }

  async delete(id: string): Promise<void> {
    await this.transactions.delete({ id });
  }

  private toDomain(
    row: TransactionOrmEntity,
    ownerUserId: string | null,
  ): Transaction {
    let label = row.label ?? '';
    let amountCents = row.amountCents ?? 0;

    if (ownerUserId && row.secretPayload) {
      const secret = JSON.parse(
        this.cipher.decrypt(
          ownerUserId,
          aad(row.id, row.spaceId),
          row.secretPayload,
        ),
      ) as SecretPayload;
      label = secret.label;
      amountCents = secret.amountCents;
    }

    return Transaction.create({
      id: row.id,
      spaceId: row.spaceId,
      kind: row.kind as TransactionKind,
      bloc: row.bloc as Bloc | null,
      label,
      amount: Money.fromCents(amountCents),
      date: new Date(row.date),
    });
  }
}

function aad(id: string, spaceId: string): string {
  return `tx:${spaceId}:${id}`;
}
