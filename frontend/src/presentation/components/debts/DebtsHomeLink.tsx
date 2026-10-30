import { Link } from 'react-router-dom';
import { useDebts } from '../../../application/use-debts';
import { CreditCardIcon } from '../Icons';

/**
 * « Mes crédits » parmi les liens de l'accueil, seulement si l'espace en a (un lien vers une page vide n'aiderait pas).
 * C'est un « plus » : tant que la liste charge ou si elle échoue, rien ne s'affiche.
 */
export function DebtsHomeLink({ spaceId }: { spaceId: string }) {
  const debts = useDebts(spaceId);
  if (!debts.data || debts.data.length === 0) {
    return null;
  }
  return (
    <Link
      to="/dettes"
      className="inline-flex min-h-[44px] items-center justify-center gap-sm rounded-full px-md font-body-sm text-body-sm font-semibold underline"
    >
      <CreditCardIcon width={18} height={18} />
      Mes crédits
    </Link>
  );
}
