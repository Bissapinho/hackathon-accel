import { Kysely, PostgresDialect } from 'kysely';
import type pg from 'pg';
import type { DB } from './types.js';

export type { DB } from './types.js';
export type Db = Kysely<DB>;

export function createDb(pool: pg.Pool): Db {
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}
