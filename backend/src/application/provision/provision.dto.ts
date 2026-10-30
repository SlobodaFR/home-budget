import { Provisions } from '../../domain/budget/provisions';
import { toIsoDate } from '../../domain/shared/calendar';
import { Bloc } from '../../domain/shared/bloc';
import { RecurringFrequency } from '../../domain/recurring/recurring-item';

export interface ProvisionsDto {
  asOf: string;
  items: {
    recurringId: string;
    label: string;
    bloc: Bloc;
    frequency: RecurringFrequency;
    amountCents: number;
    nextDueDate: string;
    monthsUntilDue: number;
    monthlyProvisionCents: number;
    /** Toujours null dans cette tranche (le suivi des provisions viendra avec les projets). */
    provisionedSoFarCents: null;
  }[];
  totalMonthlyProvisionCents: number;
  totalNextTwelveMonthsCents: number;
}

export function toProvisionsDto(provisions: Provisions): ProvisionsDto {
  return {
    asOf: toIsoDate(provisions.asOf),
    items: provisions.items.map((i) => ({
      recurringId: i.recurringId,
      label: i.label,
      bloc: i.bloc,
      frequency: i.frequency,
      amountCents: i.amountCents,
      nextDueDate: toIsoDate(i.nextDueDate),
      monthsUntilDue: i.monthsUntilDue,
      monthlyProvisionCents: i.monthlyProvisionCents,
      provisionedSoFarCents: null,
    })),
    totalMonthlyProvisionCents: provisions.totalMonthlyProvisionCents,
    totalNextTwelveMonthsCents: provisions.totalNextTwelveMonthsCents,
  };
}
