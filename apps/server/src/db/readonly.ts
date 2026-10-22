import { Kysely, PostgresDialect, sql } from 'kysely';
import type pg from 'pg';
import type { DB } from './types.js';

// Shared contract (09 §4.3). Runs `fn` on one connection as mini_reader, inside a transaction that is
// always rolled back: BEGIN; SET LOCAL ROLE mini_reader; SET LOCAL statement_timeout; fn; ROLLBACK.
// No parser check or row cap here: those belong to the SQL endpoint (modules/sql, Part B).

let readOnlyPool: pg.Pool | undefined;

export function initReadOnly(pool: pg.Pool): void {
  readOnlyPool = pool;
}

export async function withReadOnly<T>(opts: { timeoutMs: number }, fn: (db: Kysely<DB>) => Promise<T>): Promise<T> {
  if (!readOnlyPool) throw new Error('withReadOnly called before initReadOnly(pool)');
  const timeoutMs = Math.max(1, Math.floor(opts.timeoutMs));
  const client = await readOnlyPool.connect();
  // A Kysely bound to this one client, so every query of fn runs inside the transaction below.
  // Kysely releases its connection after each query: hand it a view of the client whose release is a no-op.
  const pinned = new Proxy(client, {
    get(target, prop) {
      if (prop === 'release') return () => {};
      const value: unknown = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const db = new Kysely<DB>({
    dialect: new PostgresDialect({ pool: { connect: async () => pinned, end: async () => {} } as unknown as pg.Pool }),
  });
  try {
    await client.query('BEGIN READ ONLY');
    await client.query('SET LOCAL ROLE mini_reader');
    await sql`SELECT set_config('statement_timeout', ${String(timeoutMs)}, true)`.execute(db);
    return await fn(db);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}
