import { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { CalendarIcon, HomeIcon, PlanIcon, UsersIcon } from './Icons';

const TABS: { to: string; label: string; icon: ReactNode; end?: boolean; alsoActive?: string[] }[] = [
  { to: '/', label: 'Accueil', icon: <HomeIcon />, end: true, alsoActive: ['/import', '/comptes', '/projets', '/revue', '/dettes', '/tendances', '/evenements'] },
  { to: '/plan', label: 'Plan', icon: <PlanIcon /> },
  { to: '/previsionnel', label: 'Prévisionnel', icon: <CalendarIcon /> },
  { to: '/foyer', label: 'Foyer', icon: <UsersIcon />, alsoActive: ['/aides'] },
];

export function TabBar() {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Navigation principale" className="shrink-0 border-t border-hairline-soft bg-surface pb-safe pl-safe pr-safe">
      <ul className="grid grid-cols-4">
        {TABS.map((tab) => (
          <li key={tab.to}>
            <NavLink
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex min-h-[56px] flex-col items-center justify-center gap-0.5 font-body-sm text-[12px] font-semibold ${
                  isActive || tab.alsoActive?.includes(pathname) ? 'text-ink' : 'text-mute'
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
