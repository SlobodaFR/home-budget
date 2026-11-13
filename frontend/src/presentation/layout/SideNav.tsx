import { NavLink } from 'react-router-dom';
import { APP_NAME } from '../../domain/app-info';
import { useHousehold } from '../../application/use-household';
import { HELP_NAV, MAIN_NAV, NAV_GROUPS, NavItem } from './navigation';

const itemClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-[44px] cursor-pointer items-center gap-[10px] rounded-full px-md py-sm [@media(pointer:fine)]:min-h-[40px] font-body-md text-body-md font-semibold transition-colors ${
    isActive ? 'bg-ink text-surface' : 'text-ink hover:bg-soft-cloud'
  }`;

function Item({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <li>
      <NavLink to={item.to} end className={itemClass}>
        <Icon width={20} height={20} className="shrink-0" />
        <span className="min-w-0 leading-snug">{item.label}</span>
      </NavLink>
    </li>
  );
}

/**
 * La navigation de l'ordinateur (≥ 1024 px) : une barre latérale fixe qui remplace la barre d'onglets du bas.
 * Chaque écran, secondaire compris, y a sa propre entrée : l'entrée active est celle de la page affichée (route exacte).
 */
export function SideNav() {
  const { household } = useHousehold();
  return (
    <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-hairline-soft bg-white lg:flex">
      <div className="px-6 pb-md pt-5">
        <p className="font-heading-lg text-heading-lg">{APP_NAME}</p>
        {household && (
          <p className="mt-0.5 truncate font-body-sm text-body-sm text-mute">
            {household.name}
          </p>
        )}
      </div>
      <nav
        aria-label="Navigation latérale"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-4"
      >
        <ul className="flex flex-col gap-1">
          {MAIN_NAV.map((item) => (
            <Item key={item.to} item={item} />
          ))}
        </ul>
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="mt-5">
            <p
              id={`side-nav-${group.id}`}
              className="mb-1 px-lg font-label-caps text-label-caps uppercase text-mute"
            >
              {group.label}
            </p>
            <ul
              aria-labelledby={`side-nav-${group.id}`}
              className="flex flex-col gap-1"
            >
              {group.items.map((item) => (
                <Item key={item.to} item={item} />
              ))}
            </ul>
          </div>
        ))}
        <ul className="mt-auto flex flex-col gap-1 border-t border-hairline-soft pt-md">
          <Item item={HELP_NAV} />
        </ul>
      </nav>
    </aside>
  );
}
