import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DEBT_EXTENSION_DEFAULTS,
  Debt,
  DebtKind,
  DebtRateType,
  GuaranteeKind,
  InsuranceMode,
} from '../../../domain/debt/debt';
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
  // Tranche 12 : absents des charges utiles chiffrées avant cette tranche (défauts à la lecture).
  lender?: string;
  contractReference?: string;
  initialTermMonths?: number | null;
  insuranceRateHundredths?: number | null;
  insuranceQuotityPercent?: number;
  feesCents?: number;
  guaranteeCents?: number;
  notes?: string;
}

/**
 * Espace commun : tout en clair. Espace personnel : nom, prêteur, référence, notes, durée,
 * montants, taux et quotité sont chiffrés ensemble (clé du propriétaire, AAD lié à la ligne) ;
 * le type de taux, le mode d'assurance et le type de garantie restent en clair, comme `kind`.
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
      rateType: debt.rateType,
      insuranceMode: debt.insuranceMode,
      guaranteeKind: debt.guaranteeKind,
    };
    const secret: Required<DebtSecret> = {
      name: debt.name,
      principalCents: debt.principalCents,
      remainingCents: debt.remainingCents,
      annualRateHundredths: debt.annualRateHundredths,
      monthlyPaymentCents: debt.monthlyPaymentCents,
      insuranceMonthlyCents: debt.insuranceMonthlyCents,
      lender: debt.lender,
      contractReference: debt.contractReference,
      initialTermMonths: debt.initialTermMonths,
      insuranceRateHundredths: debt.insuranceRateHundredths,
      insuranceQuotityPercent: debt.insuranceQuotityPercent,
      feesCents: debt.feesCents,
      guaranteeCents: debt.guaranteeCents,
      notes: debt.notes,
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
        lender: null,
        contractReference: null,
        initialTermMonths: null,
        insuranceRateHundredths: null,
        insuranceQuotityPercent: null,
        feesCents: null,
        guaranteeCents: null,
        notes: null,
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
      lender: row.lender ?? undefined,
      contractReference: row.contractReference ?? undefined,
      initialTermMonths: row.initialTermMonths,
      insuranceRateHundredths: row.insuranceRateHundredths,
      insuranceQuotityPercent: row.insuranceQuotityPercent ?? undefined,
      feesCents: row.feesCents ?? undefined,
      guaranteeCents: row.guaranteeCents ?? undefined,
      notes: row.notes ?? undefined,
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
    const defaults = DEBT_EXTENSION_DEFAULTS;
    return Debt.create({
      id: row.id,
      spaceId: row.spaceId,
      kind: row.kind as DebtKind,
      startDate: row.startDate,
      paymentDay: row.paymentDay,
      archived: Boolean(row.archived),
      recurringId: row.recurringId,
      name: values.name,
      principalCents: values.principalCents,
      remainingCents: values.remainingCents,
      annualRateHundredths: values.annualRateHundredths,
      monthlyPaymentCents: values.monthlyPaymentCents,
      insuranceMonthlyCents: values.insuranceMonthlyCents,
      lender: values.lender ?? defaults.lender,
      contractReference: values.contractReference ?? defaults.contractReference,
      initialTermMonths: values.initialTermMonths ?? defaults.initialTermMonths,
      rateType: (row.rateType as DebtRateType | null) ?? defaults.rateType,
      insuranceMode:
        (row.insuranceMode as InsuranceMode | null) ?? defaults.insuranceMode,
      insuranceRateHundredths:
        values.insuranceRateHundredths ?? defaults.insuranceRateHundredths,
      insuranceQuotityPercent:
        values.insuranceQuotityPercent ?? defaults.insuranceQuotityPercent,
      feesCents: values.feesCents ?? defaults.feesCents,
      guaranteeKind:
        (row.guaranteeKind as GuaranteeKind | null) ?? defaults.guaranteeKind,
      guaranteeCents: values.guaranteeCents ?? defaults.guaranteeCents,
      notes: values.notes ?? defaults.notes,
    });
  }
}

function aad(id: string, spaceId: string): string {
  return `debt:${spaceId}:${id}`;
}
