import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AidRuleId } from '../../../domain/aid/aid-rules';
import {
  RecurringFrequency,
  RecurringItem,
} from '../../../domain/recurring/recurring-item';
import { RecurringItemRepository } from '../../../domain/recurring/recurring-item.repository';
import { Bloc } from '../../../domain/shared/bloc';
import { FieldCipher } from '../../../domain/shared/field-cipher';
import { Money } from '../../../domain/shared/money';
import { TransactionKind } from '../../../domain/transaction/transaction';
import { RecurringItemOrmEntity } from '../entities/recurring-item.orm-entity';
import { SpaceOrmEntity } from '../entities/space.orm-entity';

interface SecretPayload {
  label: string;
  amountCents: number;
}

/**
 * Comme les opérations : espace commun, libellé et montant en clair ; espace
 * personnel, ils sont chiffrés (clé du propriétaire, AAD lié à la ligne). Type,
 * bloc, jour et dates restent en clair.
 */
@Injectable()
export class TypeOrmRecurringItemRepository extends RecurringItemRepository {
  constructor(
    @InjectRepository(RecurringItemOrmEntity)
    private readonly items: Repository<RecurringItemOrmEntity>,
    @InjectRepository(SpaceOrmEntity)
    private readonly spaces: Repository<SpaceOrmEntity>,
    private readonly cipher: FieldCipher,
  ) {
    super();
  }

  async findBySpace(spaceId: string): Promise<RecurringItem[]> {
    const space = await this.spaces.findOneByOrFail({ id: spaceId });
    const rows = await this.items.find({
      where: { spaceId },
      order: { id: 'ASC' },
    });
    return rows.map((row) => this.toDomain(row, space.ownerUserId));
  }

  async findById(id: string): Promise<RecurringItem | null> {
    const row = await this.items.findOne({ where: { id } });
    if (!row) {
      return null;
    }
    const space = await this.spaces.findOneByOrFail({ id: row.spaceId });
    return this.toDomain(row, space.ownerUserId);
  }

  async countByAccount(accountId: string): Promise<number> {
    return this.items.count({ where: { accountId } });
  }

  async save(item: RecurringItem): Promise<void> {
    const space = await this.spaces.findOneByOrFail({ id: item.spaceId });
    const base = {
      id: item.id,
      spaceId: item.spaceId,
      kind: item.kind,
      bloc: item.bloc,
      dayOfMonth: item.dayOfMonth,
      startDate: item.startDate,
      endDate: item.endDate,
      active: item.active,
      aidRuleId: item.aidRuleId,
      accountId: item.accountId,
      frequency: item.frequency,
      monthOfYear: item.monthOfYear,
    };

    if (space.ownerUserId) {
      const secret: SecretPayload = {
        label: item.label,
        amountCents: item.amount.toCents(),
      };
      await this.items.save({
        ...base,
        label: null,
        amountCents: null,
        secretPayload: this.cipher.encrypt(
          space.ownerUserId,
          aad(item.id, item.spaceId),
          JSON.stringify(secret),
        ),
      });
      return;
    }

    await this.items.save({
      ...base,
      label: item.label,
      amountCents: item.amount.toCents(),
      secretPayload: null,
    });
  }

  async delete(id: string): Promise<void> {
    await this.items.delete({ id });
  }

  private toDomain(
    row: RecurringItemOrmEntity,
    ownerUserId: string | null,
  ): RecurringItem {
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

    return RecurringItem.create({
      id: row.id,
      spaceId: row.spaceId,
      kind: row.kind as TransactionKind,
      bloc: row.bloc as Bloc | null,
      label,
      amount: Money.fromCents(amountCents),
      dayOfMonth: row.dayOfMonth,
      startDate: row.startDate,
      endDate: row.endDate,
      active: Boolean(row.active),
      aidRuleId: row.aidRuleId as AidRuleId | null,
      accountId: row.accountId,
      frequency: row.frequency as RecurringFrequency,
      monthOfYear: row.monthOfYear,
    });
  }
}

function aad(id: string, spaceId: string): string {
  return `rec:${spaceId}:${id}`;
}
