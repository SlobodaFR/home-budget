import { Link } from 'react-router-dom';
import { hasPlan, Summary } from '../../domain/budget';
import { formatCents, formatRatio } from '../../domain/money';
import { BlocBar } from './BlocBar';
import { cardClass } from './ui';

export function SummaryCard({ summary }: { summary: Summary }) {
  const balanceTone = summary.actualBalanceCents < 0 ? 'text-error' : 'text-ink';

  return (
    <section aria-label="Synthèse du mois" className={cardClass}>
      <p className="font-label-caps text-label-caps uppercase text-mute">Solde réel du mois</p>
      <p className={`tabular font-heading-xl text-heading-xl ${balanceTone}`}>{formatCents(summary.actualBalanceCents)}</p>
      <p className="font-body-sm text-body-sm text-mute">Prévu : {formatCents(summary.plannedBalanceCents)}</p>

      <dl className="mt-md grid grid-cols-2 gap-md border-t border-hairline-soft pt-md">
        <div>
          <dt className="font-label-caps text-label-caps uppercase text-mute">Revenus</dt>
          <dd className="tabular font-body-md text-body-md font-semibold">{formatCents(summary.income.actualCents)}</dd>
          <dd className="tabular font-body-sm text-body-sm text-mute">prévus : {formatCents(summary.income.plannedCents)}</dd>
        </div>
        <div>
          <dt className="font-label-caps text-label-caps uppercase text-mute">Taux d’épargne</dt>
          <dd className="tabular font-body-md text-body-md font-semibold">
            {summary.savingsRate === null ? '—' : formatRatio(summary.savingsRate)}
          </dd>
          <dd className="font-body-sm text-body-sm text-mute">de vos revenus réels</dd>
        </div>
      </dl>

      <ul className="mt-md divide-y divide-hairline-soft border-t border-hairline-soft">
        {summary.blocs.map((figure) => (
          <BlocBar key={figure.bloc} figure={figure} />
        ))}
      </ul>

      {!hasPlan(summary) && (
        <p className="mt-md rounded bg-soft-cloud p-md font-body-sm text-body-sm">
          Aucun plan n’est défini pour cet espace.{' '}
          <Link to="/plan" className="font-semibold underline">
            Définir le plan
          </Link>
        </p>
      )}
    </section>
  );
}
