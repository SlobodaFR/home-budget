import { minutes, type ThrottlerModuleOptions } from '@nestjs/throttler';

export const THROTTLE_ERROR_MESSAGE =
  'Trop de requêtes, réessayez dans un instant.';
export const THROTTLE_LIMIT = 100;

/**
 * Rate limit HTTP, appliqué par le ThrottlerGuard global à toutes les routes.
 * - Clé : req.ip, résolu via `trust proxy` (un saut : Caddy, cf. configure-app.ts) ; IPv6 groupé par /64.
 * - Budget par route et par IP : les membres du foyer derrière la même box partagent ce budget,
 *   largement au-dessus d'un usage normal (saisies, imports, tableaux de bord).
 * - Compteurs en mémoire, remis à zéro au redémarrage : suffisant pour une instance unique.
 */
export const throttlerOptions: ThrottlerModuleOptions = {
  errorMessage: THROTTLE_ERROR_MESSAGE,
  ipv6SubnetPrefix: 64,
  throttlers: [{ ttl: minutes(1), limit: THROTTLE_LIMIT }],
};
