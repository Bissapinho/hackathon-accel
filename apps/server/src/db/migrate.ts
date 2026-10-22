import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type pg from 'pg';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));

// Arbitrary constant: one migration run at a time per database.
const MIGRATION_LOCK = 734_001;

export type MigrateResult = { applied: string[]; skipped: string[] };

// Applies apps/server/migrations/NNN_*.sql in order, each in its own transaction, recording them in
// public.schema_migrations. Run as a role that can create roles (local superuser, avnadmin on Aiven).
export async function migrate(
  pool: pg.Pool,
  opts: { dir?: string; miniAppPassword?: string; log?: (line: string) => void } = {},
): Promise<MigrateResult> {
  const dir = opts.dir ?? MIGRATIONS_DIR;
  const log = opts.log ?? (() => {});
  const files = readdirSync(dir)
    .filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f))
    .sort();

  const client = await pool.connect();
  const result: MigrateResult = { applied: [], skipped: [] };
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
    await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set(
      (await client.query<{ name: string }>('SELECT name FROM public.schema_migrations')).rows.map((r) => r.name),
    );

    for (const file of files) {
      if (done.has(file)) {
        result.skipped.push(file);
        continue;
      }
      const text = readFileSync(path.join(dir, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(text);
        await client.query('INSERT INTO public.schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`, { cause: err });
      }
      result.applied.push(file);
      log(`applied ${file}`);
    }

    if (opts.miniAppPassword) {
      // Never stored in a migration file (schema.sql header); set here from MINI_APP_PASSWORD.
      await client.query(`ALTER ROLE mini_app PASSWORD ${client.escapeLiteral(opts.miniAppPassword)}`);
      log('set mini_app password');
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => {});
    client.release();
  }
  return result;
}
