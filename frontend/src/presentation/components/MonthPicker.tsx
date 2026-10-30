import { formatMonthLabel, shiftMonth } from '../../domain/month';
import { ChevronLeftIcon, ChevronRightIcon } from './Icons';

interface Props {
  month: string;
  onChange: (month: string) => void;
}

const stepButton = 'flex h-11 w-11 items-center justify-center rounded-full border border-hairline-soft bg-white hover:bg-soft-cloud';

export function MonthPicker({ month, onChange }: Props) {
  return (
    <div className="flex items-center justify-between">
      <button type="button" aria-label="Mois précédent" className={stepButton} onClick={() => onChange(shiftMonth(month, -1))}>
        <ChevronLeftIcon />
      </button>
      <h2 className="font-heading-lg text-heading-lg capitalize" aria-live="polite">
        {formatMonthLabel(month)}
      </h2>
      <button type="button" aria-label="Mois suivant" className={stepButton} onClick={() => onChange(shiftMonth(month, 1))}>
        <ChevronRightIcon />
      </button>
    </div>
  );
}
