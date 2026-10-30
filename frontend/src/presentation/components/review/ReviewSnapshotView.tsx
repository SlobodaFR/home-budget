import { Link } from 'react-router-dom';
import { BLOC_INFO } from '../../../domain/bloc';
import { formatCentsShort } from '../../../domain/money';
import {
  blocVerdict,
  BlocVerdictTone,
  describeBalance,
  describeExpenseCount,
  describeMissingRecurring,
  describeSavingsRate,
  describeSavingsRateNote,
  describeUnassigned,
  isEmptyMonth,
  ReviewBlocFigure,
  ReviewSnapshot,
} from '../../../domain/review';
import { AlertIcon, CheckIcon, InfoIcon } from '../Icons';
import { BLOC_STYLE } from '../bloc-style';
import { cardClass } from '../ui';

const TONE: Record<BlocVerdictTone, { text: string; badge: string; icon: typeof CheckIcon }> = {
  good: { text: 'text-success', badge: 'bg-success/10 text-success', icon: CheckIcon },
  warn: { text: 'text-error', badge: 'bg-error/10 text-error', icon: AlertIcon },
  neutral: { text: 'text-mute', badge: 'bg-soft-cloud text-ink', icon: InfoIcon },
};

function BlocRow({ figure }: { figure: ReviewBlocFigure }) {
  const info = BLOC_INFO[figure.bloc];
  const verdict = blocVerdict(figure);
  const tone = TONE[verdict.tone];
  const Icon = tone.icon;
  return (
    <li className="flex flex-col gap-1 py-md" data-testid="review-bloc" data-bloc={figure.bloc}>
      <div className="flex items-center justify-between gap-md">
        <span className="flex items-center gap-sm font-body-md text-body-md font-semibold">
          <span className={`inline-block h-3 w-3 rounded-full ${BLOC_STYLE[figure.bloc].dot}`} aria-hidden="true" />
          {info.label}
        </span>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-md py-0.5 font-body-sm text-body-sm font-semibold ${tone.badge}`}>
          <Icon width={16} height={16} />
          {verdict.label}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-md font-body-sm text-body-sm">
        <div>
          <dt className="text-mute">Prévu</dt>
          <dd className="tabular font-semibold">{formatCentsShort(figure.plannedCents)}</dd>
        </div>
        <div>
          <dt className="text-mute">Réel</dt>
          <dd className="tabular font-semibold">{formatCentsShort(figure.actualCents)}</dd>
        </div>
      </dl>
      <p className={`font-body-sm text-body-sm ${tone.text}`}>{verdict.text}</p>
    </li>
  );
}

/** Étape 1 de la revue : ce qui s'est passé, en mots simples. La couleur n'est qu'un renfort, tout est écrit. */
export function ReviewSnapshotView({ snapshot, ongoing }: { snapshot: ReviewSnapshot; ongoing: boolean }) {
  const empty = isEmptyMonth(snapshot);
  const balanceTone = snapshot.balanceCents < 0 ? 'text-error' : 'text-ink';

  return (
    <section aria-label="Bilan du mois" className="flex flex-col gap-gutter">
      {ongoing && (
        <p className="flex items-start gap-sm rounded bg-soft-cloud p-md font-body-sm text-body-sm">
          <InfoIcon width={18} height={18} className="mt-0.5 shrink-0" />
          Ce mois n’est pas terminé : les chiffres vont encore bouger. Vous pouvez faire une première revue et la compléter plus tard.
        </p>
      )}

      {empty ? (
        <div className={`${cardClass} flex flex-col items-start gap-md`}>
          <p className="font-body-md text-body-md">Aucune opération n’a été enregistrée ce mois-ci : il n’y a pas encore de bilan à lire.</p>
          <Link to="/import" className="inline-flex min-h-[44px] items-center font-body-sm text-body-sm font-semibold underline">
            Importer un relevé
          </Link>
        </div>
      ) : (
        <>
          <div className={cardClass}>
            <p className="font-label-caps text-label-caps uppercase text-mute">Solde du mois</p>
            <p className={`tabular font-heading-xl text-heading-xl ${balanceTone}`}>{formatCentsShort(snapshot.balanceCents)}</p>
            <p className="font-body-sm text-body-sm text-mute">{describeBalance(snapshot.balanceCents)}</p>
            <dl className="mt-md grid grid-cols-2 gap-md border-t border-hairline-soft pt-md">
              <div>
                <dt className="font-label-caps text-label-caps uppercase text-mute">Revenus</dt>
                <dd className="tabular font-body-md text-body-md font-semibold">{formatCentsShort(snapshot.incomeCents)}</dd>
              </div>
              <div>
                <dt className="font-label-caps text-label-caps uppercase text-mute">Dépenses</dt>
                <dd className="tabular font-body-md text-body-md font-semibold">{formatCentsShort(snapshot.expenseCents)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="font-label-caps text-label-caps uppercase text-mute">Taux d’épargne</dt>
                <dd className="tabular font-body-md text-body-md font-semibold">
                  {describeSavingsRate(snapshot)} <span className="font-body-sm text-body-sm font-normal text-mute">{describeSavingsRateNote(snapshot)}</span>
                </dd>
              </div>
            </dl>
          </div>

          <div className={cardClass}>
            <h4 className="font-label-caps text-label-caps uppercase text-mute">Prévu, réel et écart</h4>
            <ul aria-label="Prévu, réel et écart par bloc" className="mt-sm divide-y divide-hairline-soft">
              {snapshot.blocs.map((figure) => (
                <BlocRow key={figure.bloc} figure={figure} />
              ))}
            </ul>
          </div>

          <div className={cardClass}>
            <h4 className="font-label-caps text-label-caps uppercase text-mute">Vos plus grosses dépenses</h4>
            {snapshot.topExpenses.length === 0 ? (
              <p className="mt-sm font-body-sm text-body-sm text-mute">Aucune dépense enregistrée ce mois-ci.</p>
            ) : (
              <ol aria-label="Plus grosses dépenses" className="mt-sm divide-y divide-hairline-soft">
                {snapshot.topExpenses.map((expense, index) => (
                  <li key={`${expense.label}-${index}`} className="flex items-baseline justify-between gap-md py-md" data-testid="review-top-expense">
                    <span className="min-w-0">
                      <span className="block break-words font-body-md text-body-md font-semibold">{expense.label}</span>
                      <span className="block font-body-sm text-body-sm text-mute">{describeExpenseCount(expense.count)}</span>
                    </span>
                    <span className="tabular shrink-0 font-body-md text-body-md font-semibold">{formatCentsShort(expense.amountCents)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}

      {snapshot.missingRecurring.length > 0 && (
        <div role="note" aria-label="Paiements récurrents introuvables" className="flex flex-col items-start gap-sm rounded border border-plaisir/50 bg-plaisir/10 p-gutter">
          <p className="flex items-start gap-sm font-body-md text-body-md font-semibold">
            <AlertIcon width={20} height={20} className="mt-0.5 shrink-0" />
            {describeMissingRecurring(snapshot.missingRecurring)}
          </p>
          <ul className="list-disc pl-xl font-body-sm text-body-sm">
            {snapshot.missingRecurring.map((item, index) => (
              <li key={`${item.label}-${index}`}>
                {item.label} ({formatCentsShort(item.amountCents)})
              </li>
            ))}
          </ul>
          <p className="font-body-sm text-body-sm text-mute">Ils étaient attendus mais n’apparaissent pas dans vos opérations : importez votre relevé pour les retrouver.</p>
          <Link to="/import" className="inline-flex min-h-[44px] items-center font-body-sm text-body-sm font-semibold underline">
            Importer un relevé
          </Link>
        </div>
      )}

      {snapshot.unassignedTransactionCount > 0 && (
        <div role="note" aria-label="Opérations sans compte" className="flex flex-col items-start gap-sm rounded bg-soft-cloud p-gutter">
          <p className="flex items-start gap-sm font-body-sm text-body-sm">
            <InfoIcon width={18} height={18} className="mt-0.5 shrink-0" />
            {describeUnassigned(snapshot.unassignedTransactionCount)} Rattachez-les pour que le solde de chaque compte soit juste.
          </p>
          <Link to="/comptes" className="inline-flex min-h-[44px] items-center font-body-sm text-body-sm font-semibold underline">
            Voir mes comptes
          </Link>
        </div>
      )}
    </section>
  );
}
