import { Link } from 'react-router-dom';
import { Contribution, Household, membersMissingIncome } from '../../domain/household';
import { formatCents } from '../../domain/money';

interface Props {
  contribution: Contribution;
  household: Household;
}

export function ContributionPreview({ contribution, household }: Props) {
  const missing = membersMissingIncome(household);

  if (contribution.incomplete) {
    return (
      <div role="status" className="rounded border border-plaisir/40 bg-plaisir/10 p-gutter font-body-sm text-body-sm">
        <p className="font-semibold">Il manque des revenus pour calculer les parts.</p>
        <p className="mt-1">
          Chacun doit renseigner son revenu net mensuel
          {missing.length > 0 && <> (manquant : {missing.map((member) => member.name).join(', ')})</>}.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-md">
      {contribution.commonNeedCents === 0 ? (
        <p className="rounded bg-soft-cloud p-md font-body-sm text-body-sm">
          Le budget de l’espace commun est vide pour l’instant.{' '}
          <Link to="/plan" className="font-semibold underline">
            Définir le plan commun
          </Link>
        </p>
      ) : (
        <p className="font-body-sm text-body-sm text-mute">
          Budget du commun : <span className="font-semibold text-ink">{formatCents(contribution.commonNeedCents)}</span> par mois
        </p>
      )}

      {contribution.shortfallCents > 0 && (
        <p role="alert" className="rounded border border-error/30 bg-error/5 p-md font-body-sm text-body-sm text-error">
          Attention : les revenus ne suffisent pas à financer le commun, il manque{' '}
          <span className="font-semibold">{formatCents(contribution.shortfallCents)}</span> par mois.
        </p>
      )}

      <ul className="divide-y divide-hairline-soft">
        {contribution.shares.map((share) => (
          <li key={share.userId} className="py-md font-body-md text-body-md">
            <span className="font-semibold">{share.name}</span> verse{' '}
            <span className="tabular font-semibold">{formatCents(share.contributionCents)}</span>, il lui reste{' '}
            <span className={`tabular font-semibold ${share.remainingCents < 0 ? 'text-error' : ''}`}>{formatCents(share.remainingCents)}</span>.
          </li>
        ))}
      </ul>
    </div>
  );
}
