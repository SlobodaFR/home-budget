import { Link } from 'react-router-dom';
import { HeartIcon } from '../Icons';

/** « Événements de vie » parmi les liens de l'accueil (niveau foyer : le même lien quel que soit l'espace choisi). */
export function LifeEventsHomeLink() {
  return (
    <Link
      to="/evenements"
      className="inline-flex min-h-[44px] items-center justify-center gap-sm rounded-full px-md font-body-sm text-body-sm font-semibold underline"
    >
      <HeartIcon width={18} height={18} />
      Événements de vie
    </Link>
  );
}
