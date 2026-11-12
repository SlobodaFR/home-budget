import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

/**
 * En-tetes de securite de toutes les reponses : API et front React servi par le back.
 * Le front ne charge rien hors de son origine ; `data:` couvre les petites images que Vite
 * integre au build. Les liens vers les sites officiels sont des navigations, hors CSP.
 */
export function applySecurityHeaders(app: NestExpressApplication): void {
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          manifestSrc: ["'self'"],
          workerSrc: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          objectSrc: ["'none'"],
        },
      },
      // Pas de preload : difficile a annuler.
      strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true },
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
}
