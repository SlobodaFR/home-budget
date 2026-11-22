import { createHash, timingSafeEqual } from 'node:crypto';
import { Logger } from '@nestjs/common';
import {
  WebhookSignatureHeaders,
  WebhookSignatureVerifier,
} from '../../domain/auth/webhook-signature';
import { Clock } from '../../domain/shared/clock';
import { FeatureFlags } from '../../domain/shared/feature-flags';

/** Flag home-features : signature obligatoire, plus d'acceptation du ?secret=. Défaut du code : false. */
export const REQUIRE_SIGNATURE_FLAG = 'auth-webhook-require-signature';

/** Une ligne de journal par raison (et pour les acceptations par signature) sur cette durée. */
export const LOG_THROTTLE_MS = 5 * 60_000;

/** Pourquoi une acceptation s'est faite par l'ancien ?secret= plutôt que par la signature. */
type LegacyReason =
  | 'no-signature-headers'
  | 'missing-signing-secret'
  | 'raw-body-unavailable'
  | 'format'
  | 'window'
  | 'hmac';

export interface LogoutWebhookRequest {
  headers: WebhookSignatureHeaders;
  /** Octets exacts reçus (req.rawBody) ; absents si le corps n'a pas été lu comme JSON. */
  rawBody?: Buffer;
  /** Ancien secret partagé, passé en `?secret=` (retrait prévu une fois la signature en place). */
  querySecret?: string;
}

/**
 * Authentifie l'appel du webhook de déconnexion de home-auth (contrat PC7, double acceptation) :
 * signature v1 valide, OU ancien `?secret=` tant que `auth-webhook-require-signature` vaut false.
 * - Dès qu'un en-tête de signature est présent et que l'identifiant a déjà été accepté (rejeu),
 *   la requête est refusée, même avec un `?secret=` valide.
 * - Les autres échecs de signature (format, fenêtre, hmac) ou l'impossibilité de la vérifier (pas de
 *   secret de signature, corps brut absent) retombent sur le `?secret=`, tant que le flag est false.
 * - Flag à true : seule la signature compte ; sans secret de signature plus rien n'est accepté.
 * Chaque acceptation est journalisée (WARN pour le `?secret=` avec sa raison, INFO pour la signature),
 * une ligne par raison toutes les 5 minutes, sans jamais écrire secret, signature ni identifiant.
 */
export class AuthenticateLogoutWebhookUseCase {
  private readonly lastLogged = new Map<string, number>();

  /** `verifier` null : pas de secret de signature, seul l'ancien chemin existe. */
  constructor(
    private readonly verifier: WebhookSignatureVerifier | null,
    private readonly legacySecret: string,
    private readonly flags: FeatureFlags,
    private readonly clock: Clock,
    private readonly logger: Pick<Logger, 'log' | 'warn'> = new Logger(
      AuthenticateLogoutWebhookUseCase.name,
    ),
  ) {}

  async execute(request: LogoutWebhookRequest): Promise<boolean> {
    const { id, timestamp, signature } = request.headers;
    const hasSignatureHeaders = Boolean(id || timestamp || signature);

    let reason: LegacyReason;
    if (!hasSignatureHeaders) reason = 'no-signature-headers';
    else if (!this.verifier) reason = 'missing-signing-secret';
    else if (!request.rawBody) reason = 'raw-body-unavailable';
    else {
      const result = this.verifier.verify(request.headers, request.rawBody);
      if (result === 'ok') {
        this.logThrottled('info:signature', () =>
          this.logger.log('Logout webhook accepted: signature'),
        );
        return true;
      }
      if (result === 'replay') return false;
      reason = result;
    }

    // Évaluation non bloquante (mémo de l'adaptateur) ; jamais lue si la signature suffit.
    if (await this.flags.isEnabled(REQUIRE_SIGNATURE_FLAG, false)) return false;
    if (!this.matchesLegacySecret(request.querySecret)) return false;
    this.logThrottled(`warn:${reason}`, () =>
      this.logger.warn(`Logout webhook accepted: legacy ?secret= (${reason})`),
    );
    return true;
  }

  private logThrottled(key: string, write: () => void): void {
    const nowMs = this.clock.now().getTime();
    const last = this.lastLogged.get(key);
    if (last !== undefined && nowMs - last < LOG_THROTTLE_MS) return;
    this.lastLogged.set(key, nowMs);
    write();
  }

  private matchesLegacySecret(candidate: string | undefined): boolean {
    if (!this.legacySecret || typeof candidate !== 'string') return false;
    // Condensats de même taille : timingSafeEqual n'exige pas des longueurs égales en entrée.
    return timingSafeEqual(sha256(candidate), sha256(this.legacySecret));
  }
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}
