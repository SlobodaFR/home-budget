import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

/** Configuration HTTP commune au demarrage reel et aux tests de bout en bout. */
export function configureApp(app: NestExpressApplication): void {
  app.setGlobalPrefix('api');
  // Un releve CSV d'un mois pese quelques dizaines de Ko ; 1 Mo est la limite assumee.
  app.useBodyParser('json', { limit: '1mb' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.use(cookieParser());
  // Pas de CORS : le front est servi par la meme origine (et par le proxy Vite en dev).
}
