import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { applySecurityHeaders } from './interfaces/http/security-headers';

/** Configuration HTTP commune au demarrage reel et aux tests de bout en bout. */
export function configureApp(app: NestExpressApplication): void {
  applySecurityHeaders(app);
  // Un seul saut de confiance (Caddy) : req.ip, cle du rate limit, vient de X-Forwarded-For.
  app.set('trust proxy', 1);
  // /healthz reste hors du prefixe : route interne, bloquee par Caddy.
  app.setGlobalPrefix('api', { exclude: ['healthz'] });
  // Un releve CSV d'un mois pese quelques dizaines de Ko ; 1 Mo est la limite assumee.
  app.useBodyParser('json', { limit: '1mb' });
  // Express 5 : parser de query « simple » (pas d'objets ni de tableaux imbriques) ; les DTO @Query()
  // sont tous scalaires. Un futur DTO a tableau devra en tenir compte.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.use(cookieParser());
  // Pas de CORS : le front est servi par la meme origine (et par le proxy Vite en dev).
}
