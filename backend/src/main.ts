import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { validateEnv } from './config/validate-env';
import { configureApp } from './configure-app';

async function bootstrap() {
  validateEnv(process.env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  // SIGTERM (docker stop, chaque deploiement) declenche onApplicationShutdown : la telemetrie
  // vide sa file (borne a 5 s) avant l'arret.
  app.enableShutdownHooks();
  configureApp(app);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}

void bootstrap();
