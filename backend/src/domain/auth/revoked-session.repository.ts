/**
 * Port (driven side) implemented by the infrastructure layer. Tracks
 * users whose sessions were revoked centrally (cf. auth-service logout
 * webhook): any access token issued before `revokedAt` must be rejected.
 */
export abstract class RevokedSessionRepository {
  abstract markRevoked(userId: string, revokedAt: Date): Promise<void>;
  abstract getRevokedAt(userId: string): Promise<Date | null>;
}
