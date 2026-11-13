import { createHmac } from 'node:crypto';

/**
 * Identifiant stable et non réversible d'une donnée personnelle (identifiant d'un membre du foyer dans les
 * logs, telemetrie) : HMAC-SHA256 de la valeur normalisée, 16 premiers caractères hexadécimaux. Même format
 * que home-auth. Changer la normalisation ou le secret change tous les pseudonymes.
 */
export function pseudonymize(value: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(value.trim().toLowerCase())
    .digest('hex')
    .slice(0, 16);
}
