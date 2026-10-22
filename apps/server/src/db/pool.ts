import { readFileSync } from 'node:fs';
import pg from 'pg';

export type PoolOptions = { connectionString: string; caCertPath?: string; max?: number };

// One pg pool; TLS with the project CA when DATABASE_CA_CERT is set (Aiven), plain locally.
// Direct connection only, never a PgBouncer pool: we rely on SET ROLE and statement_timeout (01 §9 rule 6).
export function createPool(opts: PoolOptions): pg.Pool {
  const ssl = opts.caCertPath ? { ca: readFileSync(opts.caCertPath, 'utf8'), rejectUnauthorized: true } : undefined;
  // pg lets sslmode in the URL override the ssl object; strip it so the CA above is what applies.
  const connectionString = ssl ? stripSslParams(opts.connectionString) : opts.connectionString;
  const pool = new pg.Pool({ connectionString, ssl, max: opts.max ?? 5 });
  // An idle connection dropped by the server (restart, network) emits 'error' on the pool; without a
  // listener Node crashes the whole process. The pool discards that client and opens a new one on demand.
  pool.on('error', (err) => {
    console.error(`database: an idle connection was closed (${err.message}); it will be replaced on the next query`);
  });
  return pool;
}

function stripSslParams(url: string): string {
  const u = new URL(url);
  for (const p of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) u.searchParams.delete(p);
  return u.toString();
}
