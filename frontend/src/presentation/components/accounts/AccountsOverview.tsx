import { activeAccounts, Account, goesNegative } from '../../../domain/account';
import { formatCents } from '../../../domain/money';
import { pluralize } from '../../../domain/plural';
import { cardClass } from '../ui';

/** Le résumé en haut de l'écran des comptes (ordinateur seulement) : ce qu'il y a au total, et ce qui risque de passer sous zéro. */
export function AccountsOverview({
  accounts,
}: {
  accounts: readonly Account[];
}) {
  const active = activeAccounts(accounts);
  if (active.length === 0) {
    return null;
  }
  const totalCents = active.reduce(
    (sum, account) => sum + account.balanceCents,
    0,
  );
  const projectedCents = active.reduce(
    (sum, account) => sum + account.projectedMonthEndCents,
    0,
  );
  const atRisk = active.filter(goesNegative).length;

  return (
    <section
      aria-label="Synthèse des comptes"
      className={`${cardClass} hidden gap-6 lg:grid lg:grid-cols-3`}
    >
      <div>
        <p className="font-label-caps text-label-caps uppercase text-mute">
          Solde total
        </p>
        <p
          className={`tabular font-heading-xl text-heading-xl ${totalCents < 0 ? 'text-error' : 'text-ink'}`}
        >
          {formatCents(totalCents)}
        </p>
        <p className="font-body-sm text-body-sm text-mute">
          {pluralize(active.length, 'compte actif', 'comptes actifs')}
        </p>
      </div>
      <div>
        <p className="font-label-caps text-label-caps uppercase text-mute">
          Prévu en fin de mois
        </p>
        <p
          className={`tabular font-heading-xl text-heading-xl ${projectedCents < 0 ? 'text-error' : 'text-ink'}`}
        >
          {formatCents(projectedCents)}
        </p>
        <p className="font-body-sm text-body-sm text-mute">
          avec les paiements récurrents à venir
        </p>
      </div>
      <div>
        <p className="font-label-caps text-label-caps uppercase text-mute">
          À surveiller
        </p>
        <p
          className={`tabular font-heading-xl text-heading-xl ${atRisk > 0 ? 'text-error' : 'text-ink'}`}
        >
          {atRisk}
        </p>
        <p className="font-body-sm text-body-sm text-mute">
          {atRisk === 0
            ? 'aucun compte sous zéro avant la fin du mois'
            : atRisk === 1
              ? 'compte sous zéro avant la fin du mois'
              : 'comptes sous zéro avant la fin du mois'}
        </p>
      </div>
    </section>
  );
}
