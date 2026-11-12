import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Public } from '../decorators/public.decorator';

/**
 * État interne du service : bloqué par Caddy en production (respond /healthz* 404), joignable
 * seulement depuis le VPS (curl 127.0.0.1:3001/healthz). Vérifie que la base SQLite répond.
 */
@Public()
@Controller('healthz')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async health(): Promise<{ status: 'ok' }> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({ status: 'error' });
    }
    return { status: 'ok' };
  }
}
