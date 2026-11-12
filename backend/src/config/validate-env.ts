import { parseMasterKey } from '../infrastructure/crypto/aes-gcm-field-cipher';

const AUTH_MODES = ['oauth', 'dev'];

/**
 * Validation de l'environnement au demarrage, avant que l'app ne serve quoi que ce soit.
 * Hors production, rien n'est exige : le mode dev fonctionne sans configuration.
 * Les messages nomment la variable, jamais sa valeur.
 */
export function validateEnv(env: Record<string, string | undefined>): void {
  const mode = env.AUTH_MODE ?? 'oauth';
  if (!AUTH_MODES.includes(mode))
    throw new Error(`AUTH_MODE inconnu (attendu : ${AUTH_MODES.join(', ')})`);
  if (env.NODE_ENV !== 'production') return;

  // Le mode dev connecte sans mot de passe : jamais sur Internet.
  if (mode !== 'oauth')
    throw new Error('AUTH_MODE doit valoir oauth en production');
  // FRONTEND_URL : redirect_uri OAuth ; AUTH_SERVICE_URL : appels a home-auth.
  for (const variable of ['AUTH_SERVICE_URL', 'FRONTEND_URL'])
    assertHttpsUrl(env[variable], variable);
  for (const variable of [
    'AUTH_CLIENT_ID',
    'AUTH_CLIENT_SECRET',
    'AUTH_WEBHOOK_SECRET',
  ])
    if (!env[variable]?.trim())
      throw new Error(`${variable} est obligatoire en production`);
  assertMasterKey(env.PERSONAL_DATA_KEY);
}

function assertHttpsUrl(value: string | undefined, variable: string): void {
  let protocol: string | undefined;
  try {
    protocol = value ? new URL(value).protocol : undefined;
  } catch {
    protocol = undefined;
  }
  if (protocol !== 'https:')
    throw new Error(`${variable} doit etre une URL https:// en production`);
}

function assertMasterKey(value: string | undefined): void {
  const raw = value?.trim();
  if (!raw) throw new Error('PERSONAL_DATA_KEY est obligatoire en production');
  // Meme analyse que le chiffrement : une cle refusee ici le serait au premier dechiffrement.
  parseMasterKey(raw);
}
