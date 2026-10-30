import { Link } from 'react-router-dom';
import { formatCents } from '../../../domain/money';
import { formatLongDateInput } from '../../../domain/month';
import { FREQUENCY_LABEL } from '../../../domain/recurring';
import { pluralize } from '../../../domain/plural';
import {
  describeMonthsUntil,
  Provisions,
  sortProvisions,
} from '../../../domain/provisions';
import { BLOC_STYLE } from '../bloc-style';
import { LessonLink } from '../LessonLink';
import { PlusIcon } from '../Icons';
import { buttonPrimary, buttonSecondary, cardClass } from '../ui';

interface Props {
  provisions: Provisions;
  onAdd: () => void;
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <section aria-label="Provisions" className={`${cardClass} flex flex-col gap-md`}>
      <h3 className="font-label-caps text-label-caps uppercase text-mute">Provisions</h3>
      <p className="rounded bg-soft-cloud p-md font-body-md text-body-md">
        Aucun paiement non mensuel pour l’instant. Taxe foncière, assurance annuelle, vacances, impôts… ajoutez-les comme
        paiement récurrent « chaque année » ou « chaque trimestre » : on vous dira combien mettre de côté chaque mois.
      </p>
      <button type="button" onClick={onAdd} className={`${buttonPrimary} w-full`}>
        <PlusIcon width={18} height={18} />
        Ajouter un paiement non mensuel
      </button>
      <Link to="/plan" className="inline-flex min-h-[44px] items-center justify-center font-body-md text-body-md font-semibold underline">
        Ajuster mon plan
      </Link>
    </section>
  );
}

export function ProvisionsView({ provisions, onAdd }: Props) {
  if (provisions.items.length === 0) {
    return <EmptyState onAdd={onAdd} />;
  }
  return (
    <>
      <section aria-label="À mettre de côté" className={`${cardClass} flex flex-col gap-md`}>
        <div>
          <p className="font-label-caps text-label-caps uppercase text-mute">À mettre de côté chaque mois</p>
          <p className="tabular font-heading-xl text-heading-xl">{formatCents(provisions.totalMonthlyProvisionCents)}</p>
          <p className="font-body-sm text-body-sm text-mute">
            Pour {pluralize(provisions.items.length, 'paiement non mensuel', 'paiements non mensuels')}, soit{' '}
            <span className="tabular font-semibold text-ink">{formatCents(provisions.totalNextTwelveMonthsCents)}</span> à payer dans les 12 prochains mois.
          </p>
        </div>
        <p className="rounded bg-soft-cloud p-md font-body-sm text-body-sm">
          Un gros paiement fait moins peur quand on le répartit : on met un peu de côté chaque mois, et le jour venu l’argent est déjà là.
          C’est le « lissage », expliqué dans la leçon 2 du cours.
        </p>
        <div className="flex flex-wrap items-center gap-x-md gap-y-sm">
          <LessonLink lesson={2} />
          <Link to="/plan" className={`${buttonSecondary} min-h-[44px] px-lg`}>
            Ajuster mon plan
          </Link>
        </div>
      </section>

      <section aria-label="Prochaines échéances" className={cardClass}>
        <h3 className="font-label-caps text-label-caps uppercase text-mute">Prochaines échéances</h3>
        <ul className="mt-sm divide-y divide-hairline-soft">
          {sortProvisions(provisions.items).map((item) => (
            <li key={item.recurringId} className="flex gap-md py-md" data-testid="provision-item">
              <span
                className={`mt-1 h-10 w-1.5 shrink-0 rounded-full ${item.bloc ? BLOC_STYLE[item.bloc].dot : 'bg-mute'}`}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-md">
                  <p className="min-w-0 break-words font-body-md text-body-md font-semibold">{item.label}</p>
                  <p className="tabular shrink-0 font-body-md text-body-md font-semibold">− {formatCents(item.amountCents)}</p>
                </div>
                <p className="font-body-sm text-body-sm text-mute">
                  {item.nextDueDate ? `Le ${formatLongDateInput(item.nextDueDate)} · ` : ''}
                  <span className="font-semibold text-ink">{describeMonthsUntil(item.monthsUntilDue)}</span>
                </p>
                {item.frequency && (
                  <p className="font-body-sm text-body-sm text-mute">{FREQUENCY_LABEL[item.frequency]}</p>
                )}
                <p className="mt-1 inline-block rounded-full bg-success/10 px-md py-0.5 font-body-sm text-body-sm font-semibold text-success">
                  Mettre de côté {formatCents(item.monthlyProvisionCents)} par mois
                </p>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" onClick={onAdd} className={`${buttonSecondary} mt-md w-full text-center`}>
          <PlusIcon width={18} height={18} />
          Ajouter un paiement non mensuel
        </button>
      </section>
    </>
  );
}

