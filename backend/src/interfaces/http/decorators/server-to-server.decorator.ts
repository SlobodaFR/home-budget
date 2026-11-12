import { SetMetadata } from '@nestjs/common';

export const SERVER_TO_SERVER_KEY = 'serverToServer';

/**
 * Route appelee de serveur a serveur (webhook), jamais par le navigateur : elle ne porte pas
 * de cookie, donc echappe au SameOriginGuard. Son authentification lui est propre (secret).
 */
export const ServerToServer = () => SetMetadata(SERVER_TO_SERVER_KEY, true);
