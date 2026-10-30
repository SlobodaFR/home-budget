import { ConfigService } from '@nestjs/config';

export type AuthMode = 'oauth' | 'dev';

/**
 * `oauth` (defaut) : auth.sloboda.fr. `dev` : connexion locale factice pour
 * developper et tester ; refuse de demarrer en production.
 */
export function resolveAuthMode(config: ConfigService): AuthMode {
  const mode = config.get<string>('AUTH_MODE', 'oauth');
  if (mode !== 'oauth' && mode !== 'dev') {
    throw new Error(`AUTH_MODE inconnu : ${mode}`);
  }
  if (mode === 'dev' && config.get<string>('NODE_ENV') === 'production') {
    throw new Error('AUTH_MODE=dev est interdit en production');
  }
  return mode;
}
