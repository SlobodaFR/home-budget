import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { DatabaseModule } from './database.module';

describe('DatabaseModule', () => {
  it('serialise les transactions de la connexion de production (convention sqlite-serialized-transactions)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [() => ({ DATABASE_PATH: ':memory:' })],
        }),
        DatabaseModule,
      ],
    }).compile();
    await moduleRef.init();
    const dataSource = moduleRef.get(DataSource);

    // Le driver better-sqlite3 de TypeORM rend un seul runner partage a tous les appelants.
    expect(dataSource.createQueryRunner()).not.toBe(
      dataSource.createQueryRunner(),
    );

    await moduleRef.close();
  });
});
