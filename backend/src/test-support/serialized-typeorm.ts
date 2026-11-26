import { TypeOrmModule } from '@nestjs/typeorm';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { serializedDataSourceFactory } from '../infrastructure/persistence/serialized-connection';

/**
 * `TypeOrmModule.forRoot` on the serialized connection, like DatabaseModule (convention
 * `sqlite-serialized-transactions`). Copy into backend/src/test-support/ and use it in every test
 * module that boots TypeOrmModule on better-sqlite3.
 */
export const serializedTypeOrmRoot = (options: TypeOrmModuleOptions) =>
  TypeOrmModule.forRootAsync({
    useFactory: () => options,
    dataSourceFactory: serializedDataSourceFactory,
  });
