import packageJson from '../../package.json';

export const APP_NAME = 'Foyer Budget';

/** Lue dans le `package.json` du frontend : une seule source, mise à jour avec chaque version. */
export const APP_VERSION: string = packageJson.version;

/**
 * Adresse publique du dépôt. `null` tant qu'elle ne figure pas dans le README du projet : l'aide n'affiche alors aucun lien
 * plutôt que d'en deviner un.
 */
export const REPOSITORY_URL: string | null = null;
