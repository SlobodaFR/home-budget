import { Injectable } from '@nestjs/common';
import { RevokedSessionRepository } from '../../domain/auth/revoked-session.repository';

/** Records that a user's sessions were revoked centrally (auth-service logout webhook). */
@Injectable()
export class HandleSessionRevokedUseCase {
  constructor(
    private readonly revokedSessionRepository: RevokedSessionRepository,
  ) {}

  async execute(userId: string): Promise<void> {
    await this.revokedSessionRepository.markRevoked(userId, new Date());
  }
}
