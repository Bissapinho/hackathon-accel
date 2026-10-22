import { readFileSync } from 'node:fs';
import pg from 'pg';

export type PoolOptions = { connectionString: string; caCertPath?: string; max?: number };

// One pg pool; TLS with the project CA when DATABASE_CA_CERT is set (Aiven), plain locally.
// Direct connection only, never a PgBouncer pool: we rely on SET ROLE and statement_timeout (01 §9 rule 6).
export function createPool(opts: PoolOptions): pg.Pool {
  const ssl = opts.caCertPath ? { ca: readFileSync(opts.caCertPath, 'utf8'), rejectUnauthorized: true } : undefined;
  // pg lets sslmode in the URL override the ssl object; strip it so the CA above is what applies.
  const connectionString = ssl ? stripSslParams(opts.connectionString) : opts.connectionString;
  return new pg.Pool({ connectionString, ssl, max: opts.max ?? 5 });
}

function stripSslParams(url: string): string {
  const u = new URL(url);
  for (const p of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) u.searchParams.delete(p);
  return u.toString();
}
