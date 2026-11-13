import { ComponentType, SVGProps } from 'react';
import { HELP_ROUTE, HELP_TITLE } from '../../domain/routes';
import {
  BankIcon,
  CalendarIcon,
  ChartIcon,
  ClipboardCheckIcon,
  CreditCardIcon,
  GiftIcon,
  HeartIcon,
  HelpIcon,
  HomeIcon,
  PlanIcon,
  TargetIcon,
  UploadIcon,
  UsersIcon,
} from '../components/Icons';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export interface NavItem {
  to: string;
  label: string;
  icon: IconComponent;
}

export interface NavGroup {
  id: string;
  label: string;
  items: readonly NavItem[];
}

/** Les quatre entrées principales : celles de la barre d'onglets du bas (mobile et tablette) et du haut de la barre latérale. */
export const MAIN_NAV: readonly NavItem[] = [
  { to: '/', label: 'Accueil', icon: HomeIcon },
  { to: '/plan', label: 'Plan', icon: PlanIcon },
  { to: '/previsionnel', label: 'Prévisionnel', icon: CalendarIcon },
  { to: '/foyer', label: 'Foyer', icon: UsersIcon },
];

/** Les écrans secondaires, regroupés pour la barre latérale (≥ 1024 px). Sur mobile, on y accède depuis l'accueil et le foyer. */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'suivi',
    label: 'Suivi',
    items: [
      { to: '/import', label: 'Importer un relevé', icon: UploadIcon },
      { to: '/comptes', label: 'Comptes', icon: BankIcon },
      { to: '/revue', label: 'Revue du mois', icon: ClipboardCheckIcon },
      { to: '/tendances', label: 'Tendances', icon: ChartIcon },
    ],
  },
  {
    id: 'epargne',
    label: 'Épargne et dettes',
    items: [
      { to: '/projets', label: 'Projets', icon: TargetIcon },
      { to: '/dettes', label: 'Crédits', icon: CreditCardIcon },
    ],
  },
  {
    id: 'demarches',
    label: 'Démarches',
    items: [
      { to: '/aides', label: 'Aides officielles', icon: GiftIcon },
      { to: '/evenements', label: 'Événements de vie', icon: HeartIcon },
    ],
  },
];

export const HELP_NAV: NavItem = {
  to: HELP_ROUTE,
  label: HELP_TITLE,
  icon: HelpIcon,
};

/** Le titre (h1) de chaque écran de l'application, tel qu'il apparaît dans l'en-tête de page sur ordinateur. */
export const ROUTE_TITLES: Readonly<Record<string, string>> =
  Object.fromEntries(
    [...MAIN_NAV, ...NAV_GROUPS.flatMap((group) => group.items), HELP_NAV].map(
      (item) => [item.to, item.label],
    ),
  );

/** L'écran qui correspond à une adresse (sans barre finale) ; « Foyer » par défaut, comme la barre d'onglets. */
export function routeTitle(pathname: string): string {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return ROUTE_TITLES[clean] ?? 'Foyer';
}
