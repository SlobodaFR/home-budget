import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { HealthController } from './health.controller';

const dataSource = (query: () => Promise<unknown>) =>
  ({ query }) as unknown as DataSource;

describe('HealthController', () => {
  it('should report ok when the database answers', async () => {
    const controller = new HealthController(
      dataSource(() => Promise.resolve([{ 1: 1 }])),
    );

    await expect(controller.health()).resolves.toEqual({ status: 'ok' });
  });

  it('should answer 503 when the database does not answer', async () => {
    const controller = new HealthController(
      dataSource(() => Promise.reject(new Error('SQLITE_CANTOPEN'))),
    );

    await expect(controller.health()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
