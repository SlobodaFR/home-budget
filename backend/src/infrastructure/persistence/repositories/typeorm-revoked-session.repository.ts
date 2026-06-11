import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RevokedSessionRepository } from '../../../domain/auth/revoked-session.repository';
import { RevokedSessionOrmEntity } from '../entities/revoked-session.orm-entity';

@Injectable()
export class TypeOrmRevokedSessionRepository extends RevokedSessionRepository {
  constructor(
    @InjectRepository(RevokedSessionOrmEntity)
    private readonly repository: Repository<RevokedSessionOrmEntity>,
  ) {
    super();
  }

  async markRevoked(userId: string, revokedAt: Date): Promise<void> {
    await this.repository.save({ userId, revokedAt });
  }

  async getRevokedAt(userId: string): Promise<Date | null> {
    const row = await this.repository.findOne({ where: { userId } });
    return row ? row.revokedAt : null;
  }
}
