import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Debt, DebtKind } from '../../../domain/debt/debt';
import { DebtRepository } from '../../../domain/debt/debt.repository';
import { FieldCipher } from '../../../domain/shared/field-cipher';
import { DebtOrmEntity } from '../entities/debt.orm-entity';
import { SpaceOrmEntity } from '../entities/space.orm-entity';

interface DebtSecret {
  name: string;
  principalCents: number;
  remainingCents: number;
  annualRateHundredths: number;
  monthlyPaymentCents: number;
  insuranceMonthlyCents: number;
}

/**
 * Espace commun : tout en clair. Espace personnel : nom, montants et taux sont
 * chiffrés ensemble (clé du propriétaire, AAD lié à la ligne).
 */
@Injectable()
export class TypeOrmDebtRepository extends DebtRepository {
  constructor(
    @InjectRepository(DebtOrmEntity)
    private readonly debts: Repository<DebtOrmEntity>,
    @InjectRepository(SpaceOrmEntity)
    private readonly spaces: Repository<SpaceOrmEntity>,
    private readonly cipher: FieldCipher,
  ) {
    super();
  }

  async findBySpace(spaceId: string): Promise<Debt[]> {
    const space = await this.spaces.findOneByOrFail({ id: spaceId });
    const rows = await this.debts.find({
      where: { spaceId },
      order: { id: 'ASC' },
    });
    return rows.map((row) => this.toDomain(row, space.ownerUserId));
  }

  async findById(id: string): Promise<Debt | null> {
    const row = await this.debts.findOne({ where: { id } });
    if (!row) {
      return null;
    }
    const space = await this.spaces.findOneByOrFail({ id: row.spaceId });
    return this.toDomain(row, space.ownerUserId);
  }

  async save(debt: Debt): Promise<void> {
    const space = await this.spaces.findOneByOrFail({ id: debt.spaceId });
    const base = {
      id: debt.id,
      spaceId: debt.spaceId,
      kind: debt.kind,
      startDate: debt.startDate,
      paymentDay: debt.paymentDay,
      archived: debt.archived,
      recurringId: debt.recurringId,
    };
    const secret: DebtSecret = {
      name: debt.name,
      principalCents: debt.principalCents,
      remainingCents: debt.remainingCents,
      annualRateHundredths: debt.annualRateHundredths,
      monthlyPaymentCents: debt.monthlyPaymentCents,
      insuranceMonthlyCents: debt.insuranceMonthlyCents,
    };
    if (space.ownerUserId) {
      await this.debts.save({
        ...base,
        name: null,
        principalCents: null,
        remainingCents: null,
        annualRateHundredths: null,
        monthlyPaymentCents: null,
        insuranceMonthlyCents: null,
        secretPayload: this.cipher.encrypt(
          space.ownerUserId,
          aad(debt.id, debt.spaceId),
          JSON.stringify(secret),
        ),
      });
      return;
    }
    await this.debts.save({ ...base, ...secret, secretPayload: null });
  }

  async delete(id: string): Promise<void> {
    await this.debts.delete({ id });
  }

  private toDomain(row: DebtOrmEntity, ownerUserId: string | null): Debt {
    let values: DebtSecret = {
      name: row.name ?? '',
      principalCents: row.principalCents ?? 1,
      remainingCents: row.remainingCents ?? 0,
      annualRateHundredths: row.annualRateHundredths ?? 0,
      monthlyPaymentCents: row.monthlyPaymentCents ?? 0,
      insuranceMonthlyCents: row.insuranceMonthlyCents ?? 0,
    };
    if (ownerUserId && row.secretPayload) {
      values = JSON.parse(
        this.cipher.decrypt(
          ownerUserId,
          aad(row.id, row.spaceId),
          row.secretPayload,
        ),
      ) as DebtSecret;
    }
    return Debt.create({
      id: row.id,
      spaceId: row.spaceId,
      kind: row.kind as DebtKind,
      startDate: row.startDate,
      paymentDay: row.paymentDay,
      archived: Boolean(row.archived),
      recurringId: row.recurringId,
      ...values,
    });
  }
}

function aad(id: string, spaceId: string): string {
  return `debt:${spaceId}:${id}`;
}
