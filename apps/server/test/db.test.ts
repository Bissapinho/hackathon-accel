import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertIdent } from '../src/db/ident.js';
import { migrate } from '../src/db/migrate.js';
import { withReadOnly } from '../src/db/readonly.js';
import { seed } from '../src/db/seed.js';
import { buildTestApp, type TestApp } from './helpers.js';

let t: TestApp;
beforeAll(async () => {
  t = await buildTestApp();
});
afterAll(async () => {
  await t.close();
});

describe('T-02 migrations and seed', () => {
  it('migrate is idempotent', async () => {
    const again = await migrate(t.pool);
    expect(again.applied).toEqual([]);
    expect(again.skipped).toContain('001_init.sql');
  });

  it('creates the five schemas, the two roles and the meta tables', async () => {
    const schemas = await sql<{ nspname: string }>`
      SELECT nspname FROM pg_namespace WHERE nspname IN ('meta','data','edits','ont','logic')`.execute(t.db);
    expect(schemas.rows.map((r) => r.nspname).sort()).toEqual(['data', 'edits', 'logic', 'meta', 'ont']);

    const roles = await sql<{ rolname: string; rolcanlogin: boolean }>`
      SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname IN ('mini_app','mini_reader') ORDER BY rolname`.execute(t.db);
    expect(roles.rows).toEqual([
      { rolname: 'mini_app', rolcanlogin: true },
      { rolname: 'mini_reader', rolcanlogin: false },
    ]);

    const tables = await sql<{ n: number }>`
      SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'meta' AND tableowner = 'mini_app'`.execute(t.db);
    expect(tables.rows[0]!.n).toBeGreaterThanOrEqual(20);
  });

  it('seed is idempotent: two users, one project', async () => {
    const first = await seed(t.db);
    const second = await seed(t.db);
    expect(second.projectId).toBe(first.projectId);
    const users = await t.db.selectFrom('meta.users').select('email').where('email', 'like', '%@kumo.test').execute();
    expect(users.map((u) => u.email).sort()).toEqual(['ada@kumo.test', 'ben@kumo.test']);
    const projects = await t.db.selectFrom('meta.projects').select('id').where('name', '=', 'Kumo 2025').execute();
    expect(projects).toHaveLength(1);
  });
});

describe('read-only helper (09 §4.3)', () => {
  it('runs as mini_reader and cannot write', async () => {
    const role = await withReadOnly({ timeoutMs: 1000 }, (db) =>
      sql<{ r: string }>`SELECT current_user AS r`.execute(db),
    );
    expect(role.rows[0]!.r).toBe('mini_reader');

    await expect(
      withReadOnly({ timeoutMs: 1000 }, (db) => sql`CREATE TABLE data.should_fail (x int)`.execute(db)),
    ).rejects.toThrow();
    await expect(
      withReadOnly({ timeoutMs: 1000 }, (db) => sql`SELECT * FROM meta.users`.execute(db)),
    ).rejects.toThrow(/permission denied/);
  });

  it('applies the statement timeout', async () => {
    await expect(
      withReadOnly({ timeoutMs: 100 }, (db) => sql`SELECT pg_sleep(2)`.execute(db)),
    ).rejects.toThrow(/statement timeout/);
  });
});

describe('ident()', () => {
  it('accepts snake_case names and rejects anything else', () => {
    expect(() => assertIdent('ds_k3f9a2qx_v2')).not.toThrow();
    for (const bad of ['Commandes', '1abc', 'a-b', 'x"; drop table y; --', '', 'a'.repeat(64)]) {
      expect(() => assertIdent(bad)).toThrow();
    }
  });
});
