import { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { HomeIcon, PlanIcon, UsersIcon } from './Icons';

const TABS: { to: string; label: string; icon: ReactNode; end?: boolean; alsoActive?: string }[] = [
  { to: '/', label: 'Accueil', icon: <HomeIcon />, end: true, alsoActive: '/import' },
  { to: '/plan', label: 'Plan', icon: <PlanIcon /> },
  { to: '/foyer', label: 'Foyer', icon: <UsersIcon /> },
];

export function TabBar() {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Navigation principale" className="shrink-0 border-t border-hairline-soft bg-surface pb-safe pl-safe pr-safe">
      <ul className="grid grid-cols-3">
        {TABS.map((tab) => (
          <li key={tab.to}>
            <NavLink
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex min-h-[56px] flex-col items-center justify-center gap-0.5 font-body-sm text-[12px] font-semibold ${
                  isActive || pathname === tab.alsoActive ? 'text-ink' : 'text-mute'
                }`
              }
            >
              {tab.icon}
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
