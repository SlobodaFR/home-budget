import { formatMonthLabel } from '../../../domain/month';
import { describeCompletedOn, REVIEW_STATUS_LABEL, ReviewHistoryItem } from '../../../domain/review';
import { CheckIcon, ClockIcon } from '../Icons';
import { cardClass } from '../ui';

interface Props {
  items: readonly ReviewHistoryItem[];
  /** Le mois actuellement ouvert, mis en évidence. */
  currentMonth: string;
  onOpen: (month: string) => void;
}

/** Les revues des mois passés : statut écrit en toutes lettres, décision prise, un clic pour rouvrir le mois. */
export function ReviewHistory({ items, currentMonth, onOpen }: Props) {
  return (
    <section aria-label="Historique des revues" className={cardClass}>
      <h3 className="font-label-caps text-label-caps uppercase text-mute">Mes revues précédentes</h3>
      {items.length === 0 ? (
        <p className="mt-sm font-body-sm text-body-sm text-mute">Vos revues apparaîtront ici dès que vous aurez enregistré un brouillon ou terminé la première.</p>
      ) : (
        <ul className="mt-sm divide-y divide-hairline-soft">
          {items.map((item) => {
            const label = formatMonthLabel(item.month);
            const done = item.status === 'DONE';
            const Icon = done ? CheckIcon : ClockIcon;
            const current = item.month === currentMonth;
            return (
              <li key={item.month}>
                <button
                  type="button"
                  onClick={() => onOpen(item.month)}
                  aria-label={`Ouvrir la revue de ${label}`}
                  aria-current={current ? 'true' : undefined}
                  className={`flex min-h-[56px] w-full flex-col items-start gap-1 py-md text-left ${current ? 'bg-soft-cloud px-md' : ''}`}
                  data-testid="review-history-item"
                >
                  <span className="flex w-full items-center justify-between gap-md">
                    <span className="font-body-md text-body-md font-semibold capitalize">{label}</span>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-md py-0.5 font-body-sm text-body-sm font-semibold ${
                        done ? 'bg-success/10 text-success' : 'bg-soft-cloud text-ink'
                      }`}
                    >
                      <Icon width={16} height={16} />
                      {REVIEW_STATUS_LABEL[item.status]}
                    </span>
                  </span>
                  {item.decision.trim() !== '' && <span className="line-clamp-3 break-words font-body-sm text-body-sm">Décision : {item.decision}</span>}
                  {item.completedAt && <span className="font-body-sm text-body-sm text-mute">{describeCompletedOn(item.completedAt)}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
