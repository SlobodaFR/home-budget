/**
 * Les écrans de l'application, tels que déclarés dans `presentation/App.tsx` (un test vérifie que les deux listes
 * restent identiques). Sert à typer les renvois internes de l'aide : un lien vers un écran qui n'existe pas ne compile pas.
 */
export const APP_ROUTES = [
  '/',
  '/import',
  '/plan',
  '/previsionnel',
  '/aides',
  '/comptes',
  '/projets',
  '/revue',
  '/dettes',
  '/tendances',
  '/evenements',
  '/foyer',
  '/aide',
  '/bienvenue',
] as const;

export type AppRoute = (typeof APP_ROUTES)[number];

export function isAppRoute(value: string): value is AppRoute {
  return (APP_ROUTES as readonly string[]).includes(value);
}

/** L'écran d'aide : consultable par tout utilisateur connecté, avec ou sans foyer. */
export const HELP_ROUTE: AppRoute = '/aide';
export const HELP_TITLE = 'Aide et documentation';
