import { Link } from 'react-router-dom';
import { activeAccounts, ACCOUNT_KIND_INFO, goesNegative } from '../../domain/account';
import { useAccounts } from '../../application/use-accounts';
import { formatCents } from '../../domain/money';
import { cardClass } from './ui';

/** Résumé compact des soldes sur l'accueil ; rien tant que l'espace n'a pas de compte. */
export function AccountsSummary() {
  const { accounts } = useAccounts();
  const active = activeAccounts(accounts);
  if (active.length === 0) {
    return null;
  }
  return (
    <section aria-label="Soldes des comptes" className={cardClass}>
      <div className="flex items-baseline justify-between gap-md">
        <h3 className="font-label-caps text-label-caps uppercase text-mute">Mes comptes</h3>
        <Link to="/comptes" className="inline-flex min-h-[44px] items-center font-body-sm text-body-sm font-semibold underline">
          Gérer mes comptes
        </Link>
      </div>
      <ul className="divide-y divide-hairline-soft">
        {active.map((account) => (
          <li key={account.id} className="flex items-center justify-between gap-md py-sm">
            <span className="min-w-0">
              <span className="block break-words font-body-md text-body-md font-semibold">{account.name}</span>
              <span className="block font-body-sm text-body-sm text-mute">
                {ACCOUNT_KIND_INFO[account.kind].label}
                {goesNegative(account) && <span className="font-semibold text-error"> · sous zéro avant la fin du mois</span>}
              </span>
            </span>
            <span className={`tabular shrink-0 font-body-md text-body-md font-semibold ${account.balanceCents < 0 ? 'text-error' : 'text-ink'}`}>
              {formatCents(account.balanceCents)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
