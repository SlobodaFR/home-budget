import { useState } from 'react';
import { AidRule } from '../../../domain/aids';
import { formatCents } from '../../../domain/money';
import { pluralize } from '../../../domain/plural';
import {
  countNonMonthly,
  describeBloc,
  describePeriod,
  describeSchedule,
  monthlyTotals,
  RecurringPayment,
  sortRecurring,
} from '../../../domain/recurring';
import { PencilIcon, PlusIcon, TrashIcon } from '../Icons';
import { BLOC_STYLE } from '../bloc-style';
import { buttonPrimary, cardClass } from '../ui';

interface Props {
  items: RecurringPayment[];
  aidRules: AidRule[] | null;
  /** Nom du compte rattaché, s'il y en a un. */
  accountNameOf?: (accountId: string | null | undefined) => string | null;
  busy: boolean;
  onAdd: () => void;
  onEdit: (item: RecurringPayment) => void;
  onToggle: (item: RecurringPayment, active: boolean) => void;
  onDelete: (item: RecurringPayment) => Promise<void>;
}

const iconButton = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-soft-cloud disabled:opacity-40';

function Row({
  item,
  aidLabel,
  accountLabel,
  busy,
  onEdit,
  onToggle,
  onDelete,
}: {
  item: RecurringPayment;
  aidLabel: string | null;
  accountLabel: string | null;
  busy: boolean;
  onEdit: Props['onEdit'];
  onToggle: Props['onToggle'];
  onDelete: Props['onDelete'];
}) {
  const [confirming, setConfirming] = useState(false);
  const income = item.kind === 'INCOME';

  return (
    <li className={`py-md ${item.active ? '' : 'opacity-60'}`}>
      <div className="flex gap-md">
        <span
          className={`mt-1 h-10 w-1.5 shrink-0 rounded-full ${item.bloc ? BLOC_STYLE[item.bloc].dot : 'bg-success'}`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-md">
            <p className="min-w-0 break-words font-body-md text-body-md font-semibold">{item.label}</p>
            <p className={`tabular shrink-0 font-body-md text-body-md font-semibold ${income ? 'text-success' : 'text-ink'}`}>
              {income ? '+ ' : '− '}
              {formatCents(item.amountCents)}
            </p>
          </div>
          <p className="font-body-sm text-body-sm text-mute">
            {describeBloc(item)} · {describeSchedule(item)}
            {accountLabel ? ` · ${accountLabel}` : ''}
          </p>
          <p className="font-body-sm text-body-sm text-mute">{describePeriod(item)}</p>
          {aidLabel && (
            <p className="mt-1 inline-block rounded-full bg-success/10 px-md py-0.5 font-body-sm text-body-sm font-semibold text-success">
              Aide : {aidLabel}
            </p>
          )}
        </div>
      </div>

      {confirming ? (
        <div className="mt-sm flex items-center justify-between gap-md">
          <p className="font-body-md text-body-md font-semibold">Supprimer ce paiement ?</p>
          <div className="flex shrink-0 gap-sm">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="min-h-[44px] rounded-full border border-hairline px-lg font-button-md text-body-sm font-semibold"
            >
              Non
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                try {
                  await onDelete(item);
                } finally {
                  setConfirming(false);
                }
              }}
              className="min-h-[44px] rounded-full bg-error px-lg font-button-md text-body-sm font-semibold text-white disabled:opacity-40"
            >
              Supprimer
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-sm flex items-center justify-between gap-md">
          <button
            type="button"
            role="switch"
            aria-checked={item.active}
            aria-label={`${item.active ? 'Mettre en pause' : 'Réactiver'} ${item.label}`}
            disabled={busy}
            onClick={() => onToggle(item, !item.active)}
            className="flex min-h-[44px] items-center gap-md disabled:opacity-40"
          >
            <span
              className={`relative inline-block h-7 w-12 rounded-full transition-colors ${item.active ? 'bg-ink' : 'bg-hairline'}`}
              aria-hidden="true"
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${item.active ? 'left-6' : 'left-1'}`}
              />
            </span>
            <span className="font-body-sm text-body-sm font-semibold">{item.active ? 'Actif' : 'En pause'}</span>
          </button>
          <div className="flex shrink-0">
            <button type="button" onClick={() => onEdit(item)} aria-label={`Modifier ${item.label}`} className={iconButton}>
              <PencilIcon width={20} height={20} />
            </button>
            <button type="button" onClick={() => setConfirming(true)} aria-label={`Supprimer ${item.label}`} className={iconButton}>
              <TrashIcon width={20} height={20} />
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

export function RecurringList({ items, aidRules, accountNameOf, busy, onAdd, onEdit, onToggle, onDelete }: Props) {
  const totals = monthlyTotals(items);
  const sorted = sortRecurring(items);
  const nonMonthly = countNonMonthly(items);
  const aidLabel = (item: RecurringPayment) =>
    item.aidRuleId ? (aidRules?.find((rule) => rule.id === item.aidRuleId)?.label ?? 'aide officielle') : null;

  return (
    <section aria-label="Paiements récurrents" className={cardClass}>
      <div className="flex items-center justify-between gap-md">
        <h3 className="font-label-caps text-label-caps uppercase text-mute">Paiements récurrents</h3>
        <button type="button" onClick={onAdd} className={`${buttonPrimary} min-h-[44px] px-lg`}>
          <PlusIcon width={18} height={18} />
          Ajouter
        </button>
      </div>
      <p className="mt-sm font-body-sm text-body-sm text-mute">
        Loyer, salaire, abonnements… Et aussi ce qui revient chaque trimestre ou chaque année, pour que la prévision soit juste.
      </p>

      {items.length === 0 ? (
        <p className="mt-md rounded bg-soft-cloud p-md font-body-sm text-body-sm">
          Aucun paiement récurrent pour l’instant. Commencez par votre loyer ou votre salaire.
        </p>
      ) : (
        <>
          <p className="tabular mt-md font-body-sm text-body-sm">
            Chaque mois : <span className="font-semibold text-success">+ {formatCents(totals.incomeCents)}</span> de revenus,{' '}
            <span className="font-semibold">− {formatCents(totals.expenseCents)}</span> de dépenses
          </p>
          {nonMonthly > 0 && (
            <p className="mt-1 font-body-sm text-body-sm text-mute">
              Non compté ici : {pluralize(nonMonthly, 'paiement non mensuel', 'paiements non mensuels')} (trimestre ou année), à retrouver dans l’onglet Provisions.
            </p>
          )}
          <ul className="mt-sm divide-y divide-hairline-soft">
            {sorted.map((item) => (
              <Row key={item.id} item={item} aidLabel={aidLabel(item)} accountLabel={accountNameOf?.(item.accountId) ?? null} busy={busy} onEdit={onEdit} onToggle={onToggle} onDelete={onDelete} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
