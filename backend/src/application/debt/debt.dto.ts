import { DebtKind } from '../../domain/debt/debt';
import { DebtView, WhatIf } from '../../domain/debt/debt-view';

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
  };
}

export type WhatIfDto = WhatIf;
