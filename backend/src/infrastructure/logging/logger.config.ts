import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import { pseudonymize } from './pseudonymize';

/**
 * Défense en profondeur : la redaction pino ne regarde que des clés d'objet. Le vrai contrôle est
 * que les serializers ne gardent ni en-têtes (cookies de session), ni query string (secret du
 * webhook home-auth, code OAuth, utilisateur du mode dev), ni corps (données financières).
 */
export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  '*.email',
  '*.secret',
  // Une QueryFailedError TypeORM porte la requête et ses paramètres (libellés, montants, membres).
  'err.query',
  'err.parameters',
  'err.driverError',
];

const pathOf = (url: string | undefined): string =>
  (url ?? '').split('?')[0] ?? '';

export function loggerParams(
  nodeEnv: string | undefined,
  pseudonymSecret: string | undefined,
): Params {
  return {
    pinoHttp: {
      level: nodeEnv === 'test' ? 'silent' : 'info',
      redact: REDACT_PATHS,
      serializers: {
        req: (req: IncomingMessage) => ({
          method: req.method,
          url: pathOf(req.url),
        }),
        res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
      },
      // Seule l'API est journalisée : le front, ses fichiers et /healthz feraient du bruit.
      autoLogging: {
        ignore: (req: IncomingMessage) => !pathOf(req.url).startsWith('/api/'),
      },
      // Le membre connecté (posé par JwtAuthGuard) n'apparaît que sous pseudonyme de son id, ou pas
      // du tout : ni email, ni nom.
      customProps: (req: IncomingMessage) => {
        const id = (req as IncomingMessage & { user?: { id?: unknown } }).user
          ?.id;
        return typeof id === 'string' && pseudonymSecret
          ? { user: pseudonymize(id, pseudonymSecret) }
          : {};
      },
      customLogLevel: (
        _req: IncomingMessage,
        res: ServerResponse,
        err?: Error,
      ) => {
        if (err || res.statusCode >= 500) return 'error';
        return res.statusCode >= 400 ? 'warn' : 'info';
      },
    },
  };
}
