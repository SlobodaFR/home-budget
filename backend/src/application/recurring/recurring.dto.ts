import { Bloc } from '../../domain/shared/bloc';
import { AidRuleId } from '../../domain/aid/aid-rules';
import { RecurringItem } from '../../domain/recurring/recurring-item';
import { TransactionKind } from '../../domain/transaction/transaction';

export interface RecurringItemDto {
  id: string;
  spaceId: string;
  kind: TransactionKind;
  bloc: Bloc | null;
  label: string;
  amountCents: number;
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  active: boolean;
  aidRuleId: AidRuleId | null;
}

export function toRecurringItemDto(item: RecurringItem): RecurringItemDto {
  return {
    id: item.id,
    spaceId: item.spaceId,
    kind: item.kind,
    bloc: item.bloc,
    label: item.label,
    amountCents: item.amount.toCents(),
    dayOfMonth: item.dayOfMonth,
    startDate: item.startDate,
    endDate: item.endDate,
    active: item.active,
    aidRuleId: item.aidRuleId,
  };
}
