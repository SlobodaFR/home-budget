import {
  DebtKind,
  DebtRateType,
  GuaranteeKind,
  InsuranceMode,
} from '../../domain/debt/debt';
import { DebtView, PaymentCheck, WhatIf } from '../../domain/debt/debt-view';

export interface DebtDto {
  id: string;
  spaceId: string;
  name: string;
  kind: DebtKind;
  principalCents: number;
  remainingCents: number;
  annualRatePercent: number;
  monthlyPaymentCents: number;
  startDate: string;
  paymentDay: number;
  insuranceMonthlyCents: number;
  monthsRemaining: number | null;
  payoffDate: string | null;
  totalInterestRemainingCents: number | null;
  paidSharePercent: number;
  archived: boolean;
  recurringId: string | null;
  /** Présent (true) seulement si la dette ne diminue jamais. */
  neverPaidOff?: true;
  lender: string;
  contractReference: string;
  initialTermMonths: number | null;
  rateType: DebtRateType | null;
  insuranceMode: InsuranceMode;
  insuranceRatePercent: number | null;
  insuranceQuotityPercent: number;
  feesCents: number;
  guaranteeKind: GuaranteeKind;
  guaranteeCents: number;
  notes: string;
  monthlyInsuranceCents: number;
  monthlyTotalCents: number;
  remainingInsuranceCents: number | null;
  remainingCostCents: number | null;
  paymentCheck: PaymentCheck;
}

export function toDebtDto(view: DebtView): DebtDto {
  const d = view.debt;
  return {
    id: d.id,
    spaceId: d.spaceId,
    name: d.name,
    kind: d.kind,
    principalCents: d.principalCents,
    remainingCents: d.remainingCents,
    // Centièmes de pourcent entiers -> pourcent (390 -> 3.9).
    annualRatePercent: d.annualRateHundredths / 100,
    monthlyPaymentCents: d.monthlyPaymentCents,
    startDate: d.startDate,
    paymentDay: d.paymentDay,
    insuranceMonthlyCents: d.insuranceMonthlyCents,
    monthsRemaining: view.monthsRemaining,
    payoffDate: view.payoffDate,
    totalInterestRemainingCents: view.totalInterestRemainingCents,
    paidSharePercent: view.paidSharePercent,
    archived: d.archived,
    recurringId: d.recurringId,
    ...(view.neverPaidOff ? { neverPaidOff: true as const } : {}),
    lender: d.lender,
    contractReference: d.contractReference,
    initialTermMonths: d.initialTermMonths,
    rateType: d.rateType,
    insuranceMode: d.insuranceMode,
    insuranceRatePercent:
      d.insuranceRateHundredths === null
        ? null
        : d.insuranceRateHundredths / 100,
    insuranceQuotityPercent: d.insuranceQuotityPercent,
    feesCents: d.feesCents,
    guaranteeKind: d.guaranteeKind,
    guaranteeCents: d.guaranteeCents,
    notes: d.notes,
    monthlyInsuranceCents: view.monthlyInsuranceCents,
    monthlyTotalCents: view.monthlyTotalCents,
    remainingInsuranceCents: view.remainingInsuranceCents,
    remainingCostCents: view.remainingCostCents,
    paymentCheck: view.paymentCheck,
  };
}

export type WhatIfDto = WhatIf;
