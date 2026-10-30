import { toIsoDate } from '../shared/calendar';
import { Occurrence } from '../budget/forecast';
import { Transaction } from '../transaction/transaction';
import { Account } from './account';

export interface AccountView {
  account: Account;
  /** Solde d'ouverture + revenus − dépenses rattachés dont le jour (UTC) est >= `openingDate`. */
  balanceCents: number;
  /** `balanceCents` + récurrents rattachés encore DUE ou MISSING du mois courant ; = solde si archivé. */
  projectedMonthEndCents: number;
  /** Opérations rattachées, tous mois et toutes dates confondus. */
  transactionCount: number;
}

const signed = (kind: 'INCOME' | 'EXPENSE', cents: number) =>
  kind === 'INCOME' ? cents : -cents;

/**
 * Soldes des comptes d'un espace. `attached` : les opérations rattachées à un
 * compte (les autres sont ignorées) ; `monthOccurrences` : les occurrences du
 * mois courant déjà appariées par le moteur du prévisionnel.
 * Les comptes archivés viennent en dernier ; à l'intérieur, tri par nom.
 */
export function buildAccountViews(
  accounts: Account[],
  attached: Transaction[],
  monthOccurrences: Occurrence[],
): AccountView[] {
  const views = accounts.map((account): AccountView => {
    const own = attached.filter((t) => t.accountId === account.id);
    const balanceCents =
      account.openingBalanceCents +
      own
        .filter((t) => toIsoDate(t.date) >= account.openingDate)
        .reduce((sum, t) => sum + signed(t.kind, t.amount.toCents()), 0);
    const pending = account.archived
      ? 0
      : monthOccurrences
          .filter(
            (o) =>
              o.accountId === account.id &&
              (o.status === 'DUE' || o.status === 'MISSING'),
          )
          .reduce((sum, o) => sum + signed(o.kind, o.amountCents), 0);
    return {
      account,
      balanceCents,
      projectedMonthEndCents: balanceCents + pending,
      transactionCount: own.length,
    };
  });
  return views.sort(
    (a, b) =>
      Number(a.account.archived) - Number(b.account.archived) ||
      a.account.name.localeCompare(b.account.name, 'fr') ||
      a.account.id.localeCompare(b.account.id),
  );
}
