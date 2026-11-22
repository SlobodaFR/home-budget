import { createHmac, timingSafeEqual } from 'node:crypto';
import { Clock } from '../shared/clock';

/** Écart maximal toléré entre l'horodatage signé et l'horloge locale (contrat PC7). */
export const WEBHOOK_TOLERANCE_SECONDS = 120;
/** Durée pendant laquelle un identifiant de webhook accepté est refusé s'il revient (contrat PC7). */
export const WEBHOOK_REPLAY_TTL_MS = 10 * 60_000;

const TIMESTAMP_FORMAT = /^[0-9]{1,15}$/;
const SIGNATURE_ENTRY_FORMAT = /^v1=[0-9a-fA-F]{64}$/;

/** Résultat d'une vérification : `ok`, ou la raison du refus (jamais journalisée avec des valeurs). */
export type WebhookSignatureResult =
  | 'ok'
  | 'replay'
  | 'format'
  | 'window'
  | 'hmac';

export interface WebhookSignatureHeaders {
  /** X-Auth-Webhook-Id */
  id?: string;
  /** X-Auth-Webhook-Timestamp (secondes unix) */
  timestamp?: string;
  /** X-Auth-Webhook-Signature : `v1=<hex>[,v1=<hex>]` */
  signature?: string;
}

/**
 * Signature du webhook de déconnexion (contrat PC7, identique à home-auth).
 * hex = HMAC-SHA256(secret, `${id}.${timestamp}.${rawBody}`) ; la clé est la chaîne du secret
 * telle que stockée (64 caractères hexadécimaux, en UTF-8) et rawBody les octets reçus.
 */
export function computeWebhookSignature(
  secret: string,
  id: string,
  timestamp: string,
  rawBody: string | Buffer,
): string {
  return createHmac('sha256', secret)
    .update(`${id}.${timestamp}.`)
    .update(rawBody)
    .digest('hex');
}

/**
 * Vérifie la signature v1 d'un webhook de déconnexion : en-têtes bien formés, horodatage dans la
 * fenêtre, au moins une entrée `v1=` égale (timingSafeEqual sur 32 octets) au HMAC recalculé,
 * identifiant jamais accepté dans les 10 dernières minutes. L'identifiant n'est retenu qu'après
 * une signature valide : une requête forgée ne peut pas « brûler » l'identifiant d'une vraie.
 * Les identifiants vus sont gardés en mémoire du processus (un redémarrage les oublie).
 */
export class WebhookSignatureVerifier {
  /** Identifiant → fin de rétention. Ordre d'insertion = ordre d'expiration (TTL constant). */
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly secret: string,
    private readonly clock: Clock,
  ) {}

  verify(
    headers: WebhookSignatureHeaders,
    rawBody: string | Buffer,
  ): WebhookSignatureResult {
    const { id, timestamp, signature } = headers;
    // Un id déjà accepté est un rejeu quelle que soit la suite (même si les autres en-têtes sont
    // absents ou mal formés) : l'appelant ne doit pas retomber sur l'ancien ?secret=.
    const nowMs = this.clock.now().getTime();
    this.forgetExpired(nowMs);
    if (id && this.seen.has(id)) return 'replay';

    if (!id || !timestamp || !signature) return 'format';
    if (!TIMESTAMP_FORMAT.test(timestamp)) return 'format';
    const received = this.parseSignatures(signature);
    if (!received) return 'format';

    if (
      Math.abs(Math.floor(nowMs / 1000) - Number(timestamp)) >
      WEBHOOK_TOLERANCE_SECONDS
    )
      return 'window';

    const expected = Buffer.from(
      computeWebhookSignature(this.secret, id, timestamp, rawBody),
      'hex',
    );
    // Pas de court-circuit : chaque entrée est comparée, quelle que soit la position de la bonne.
    let matched = false;
    for (const candidate of received)
      if (timingSafeEqual(candidate, expected)) matched = true;
    if (!matched) return 'hmac';

    this.seen.set(id, nowMs + WEBHOOK_REPLAY_TTL_MS);
    return 'ok';
  }

  /** Entrées `v1=<hex>` décodées en 32 octets ; null si une seule entrée est mal formée. */
  private parseSignatures(header: string): Buffer[] | null {
    const entries = header.split(',').map((entry) => entry.trim());
    if (!entries.every((entry) => SIGNATURE_ENTRY_FORMAT.test(entry)))
      return null;
    return entries.map((entry) => Buffer.from(entry.slice(3), 'hex'));
  }

  private forgetExpired(nowMs: number): void {
    for (const [id, expiresAt] of this.seen) {
      if (expiresAt > nowMs) break;
      this.seen.delete(id);
    }
  }
}
