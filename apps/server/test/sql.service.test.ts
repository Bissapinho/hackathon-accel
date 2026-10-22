import type { SqlResponse } from '@mini/shared';
import { sql } from 'kysely';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../src/db/index.js';
import { createPool } from '../src/db/pool.js';
import { initReadOnly, withReadOnly } from '../src/db/readonly.js';
import { ApiError } from '../src/errors.js';
import { createSqlService, summarizeResult, toSqlError, type SqlService } from '../src/modules/sql/service.js';
import { TEST_DATABASE_URL } from './helpers.js';

// T-16 on the database (O3), through the real withReadOnly (BEGIN READ ONLY, SET LOCAL ROLE mini_reader).
// The test creates its own data.* table and logic.* view (as mini_app) and drops them at the end.

describe('summarizeResult', () => {
  const wide: SqlResponse = {
    columns: [
      { name: 'id', type: 'integer' },
      { name: 'libellé', type: 'text' },
    ],
    rows: Array.from({ length: 500 }, (_, i) => [i, `crème brûlée n°${i} ${'é'.repeat(100)}`]),
    truncated: true,
    ms: 3,
  };

  it('stays under 2 KB (UTF-8 bytes) and says rows were left out', () => {
    const text = summarizeResult(wide);
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(2048);
    expect(text.split('\n')[0]).toBe('more than 500 rows (first 500 fetched); columns: id (integer), libellé (text)');
    expect(text).toMatch(/rows not shown, and more exist$/);
  });

  it('shows small results whole', () => {
    const text = summarizeResult({
      columns: [
        { name: 'signe', type: 'integer' },
        { name: 'n', type: 'bigint' },
        { name: 'd', type: 'date' },
      ],
      rows: [
        [-1, '12', new Date('2025-10-14T00:00:00Z')],
        [1, '30', null],
      ],
      truncated: false,
      ms: 1,
    });
    expect(text).toBe(
      ['2 rows; columns: signe (integer), n (bigint), d (date)', 'signe | n | d', '-1 | 12 | 2025-10-14T00:00:00.000Z', '1 | 30 | NULL'].join(
        '\n',
      ),
    );
  });
});

describe('SQL service on Postgres (O3)', () => {
  let pool: pg.Pool;
  let db: Db;
  let service: SqlService;
  const pid = '00000000-0000-0000-0000-000000000000';
  const tag = `t16_${Math.random().toString(36).slice(2, 8)}`;

  const asMiniApp = (statements: string) =>
    db.connection().execute(async (conn) => {
      await sql`SET ROLE mini_app`.execute(conn);
      try {
        await sql.raw(statements).execute(conn);
      } finally {
        await sql`RESET ROLE`.execute(conn);
      }
    });

  const failure = async (q: string): Promise<ApiError> => {
    try {
      await service.run(pid, { sql: q });
    } catch (e) {
      if (e instanceof ApiError) return e;
      throw e;
    }
    throw new Error(`expected ${q} to fail`);
  };

  const count = async () => (await sql<{ n: string }>`SELECT count(*) AS n FROM ${sql.table(`data.${tag}`)}`.execute(db)).rows[0]!.n;

  beforeAll(async () => {
    pool = createPool({ connectionString: TEST_DATABASE_URL, max: 3 });
    initReadOnly(pool);
    db = createDb(pool);
    service = createSqlService();
    await asMiniApp(`
      CREATE TABLE data.${tag} AS SELECT g AS id, 'nom ' || g AS nom, (g % 7)::numeric(10,2) AS qte FROM generate_series(1, 750) g;
      CREATE VIEW logic.${tag} AS SELECT id, id * 2 AS double, qte > 3 AS surcharge FROM data.${tag};
    `);
  });

  afterAll(async () => {
    await asMiniApp(`DROP VIEW IF EXISTS logic.${tag}; DROP TABLE IF EXISTS data.${tag};`);
    await db.destroy();
  });

  it('caps results at 500 rows with truncated: true, with column names and types', async () => {
    const r = await service.run(pid, { sql: `SELECT * FROM data.${tag} ORDER BY id;` });
    expect(r.columns).toEqual([
      { name: 'id', type: 'integer' },
      { name: 'nom', type: 'text' },
      { name: 'qte', type: 'numeric' },
    ]);
    expect(r.rows).toHaveLength(500);
    expect(r.truncated).toBe(true);
    expect(r.rows[0]).toEqual([1, 'nom 1', '1.00']);
    expect(r.rows[499]![0]).toBe(500);
    expect(r.ms).toBeGreaterThanOrEqual(0);
    expect(Object.keys(r).sort()).toEqual(['columns', 'ms', 'rows', 'truncated']);
  });

  it('returns smaller results whole, with truncated: false', async () => {
    const r = await service.run(pid, { sql: `-- three rows\nSELECT id, nom FROM data.${tag} WHERE id <= 3 ORDER BY id -- done` });
    expect(r).toMatchObject({ truncated: false, rows: [[1, 'nom 1'], [2, 'nom 2'], [3, 'nom 3']] });
    const exact = await service.run(pid, { sql: `SELECT id FROM data.${tag} WHERE id <= 500` });
    expect(exact.rows).toHaveLength(500);
    expect(exact.truncated).toBe(false);
  });

  it('reads logic.* views and WITH queries', async () => {
    const r = await service.run(pid, {
      sql: `WITH x AS (SELECT * FROM logic.${tag} WHERE id IN (2, 5)) SELECT id, double, surcharge FROM x ORDER BY id`,
    });
    expect(r.columns).toEqual([
      { name: 'id', type: 'integer' },
      { name: 'double', type: 'integer' },
      { name: 'surcharge', type: 'boolean' },
    ]);
    expect(r.rows).toEqual([
      [2, 4, false],
      [5, 10, true],
    ]);
  });

  it('describes empty results, duplicate names and pseudo-type columns', async () => {
    const empty = await service.run(pid, { sql: `SELECT id, nom AS "Nom ""x""" FROM data.${tag} WHERE false` });
    expect(empty).toMatchObject({ columns: [{ name: 'id', type: 'integer' }, { name: 'Nom "x"', type: 'text' }], rows: [], truncated: false });
    const dup = await service.run(pid, { sql: `SELECT id, nom AS id, 7 AS "2" FROM data.${tag} WHERE id = 1` });
    expect(dup.columns.map((c) => c.name)).toEqual(['id', 'id', '2']);
    expect(dup.rows).toEqual([[1, 'nom 1', 7]]);
    const pseudo = await service.run(pid, { sql: 'SELECT 1 AS a, pg_sleep(0) AS s, ROW(1, 2) AS r' });
    expect(pseudo.columns).toEqual([
      { name: 'a', type: 'integer' },
      { name: 's', type: 'void' },
      { name: 'r', type: 'record' },
    ]);
    expect(pseudo.rows).toEqual([[1, '', '(1,2)']]);
    const noColumns = await service.run(pid, { sql: `SELECT FROM data.${tag} WHERE id <= 2` });
    expect(noColumns).toMatchObject({ columns: [], rows: [[], []], truncated: false });
  });

  it('rejects DELETE, UPDATE, DROP and multi-statements before running them (SQL_REJECTED)', async () => {
    for (const q of [`DELETE FROM data.${tag}`, `UPDATE data.${tag} SET nom = 'x'`, `DROP TABLE data.${tag}`, `SELECT 1; DELETE FROM data.${tag}`]) {
      expect(await failure(q)).toMatchObject({ code: 'SQL_REJECTED', status: 400 });
    }
    expect(await count()).toBe('750');
  });

  it('stops a 6-second query with SQL_TIMEOUT', async () => {
    const e = await failure('SELECT pg_sleep(6)');
    expect(e).toMatchObject({ code: 'SQL_TIMEOUT', status: 422 });
    expect(e.extra.hint).toBeTruthy();
  }, 15_000);

  it('a write that gets past the parser is refused by the read-only transaction, and nothing is kept', async () => {
    let caught: unknown;
    try {
      await withReadOnly({ timeoutMs: 5000 }, (ro) => sql.raw(`DELETE FROM data.${tag}`).execute(ro));
    } catch (e) {
      caught = toSqlError(e, 5000);
    }
    expect(caught).toMatchObject({ code: 'SQL_REJECTED', status: 400 });
    expect(await count()).toBe('750');
  });

  it("set_config('role', 'mini_app') is rejected by the parser, and a write after that escape is still refused", async () => {
    expect(await failure(`SELECT set_config('role', 'mini_app', true)`)).toMatchObject({ code: 'SQL_REJECTED', message: /set_config/ });

    // Bypassing the parser: the role switch itself works (the session user is a member of mini_app)…
    const pgErr = await withReadOnly({ timeoutMs: 5000 }, async (ro) => {
      const role = await sql<{ r: string }>`SELECT set_config('role', 'mini_app', true) AS r, current_user AS u`.execute(ro);
      expect(role.rows[0]).toMatchObject({ r: 'mini_app', u: 'mini_app' });
      // …but BEGIN READ ONLY refuses the write, and the read-only mode can't be turned off mid-transaction.
      const write = await sql.raw(`DELETE FROM data.${tag}`).execute(ro).then(() => null, (e: unknown) => e);
      return write;
    });
    expect(pgErr).toMatchObject({ code: '25006' });
    expect(toSqlError(pgErr, 5000)).toMatchObject({ code: 'SQL_REJECTED' });

    const toggle = await withReadOnly({ timeoutMs: 5000 }, async (ro) => {
      await sql`SELECT set_config('role', 'mini_app', true)`.execute(ro);
      return sql`SELECT set_config('transaction_read_only', 'off', true)`.execute(ro).then(() => null, (e: unknown) => e);
    });
    expect(toggle).toMatchObject({ message: /read-write mode must be set before any query/ });
    expect(await count()).toBe('750');
  });

  it('refuses tables outside logic, ont and data', async () => {
    expect(await failure('SELECT * FROM meta.users')).toMatchObject({ code: 'SQL_REJECTED', status: 400 });
  });

  it('turns other Postgres errors into SQL_ERROR with a hint', async () => {
    const e = await failure(`SELECT nope FROM data.${tag}`);
    expect(e).toMatchObject({ code: 'SQL_ERROR', status: 400, message: /column "nope" does not exist/ });
    expect(e.extra.hint).toBeTruthy();
    expect(await failure('SELECT FROM WHERE')).toMatchObject({ code: 'SQL_ERROR' });
  });

  it('leaves nothing behind on the pooled connections: queries run again', async () => {
    for (let i = 0; i < 6; i++) expect((await service.run(pid, { sql: 'SELECT 1 AS one' })).rows).toEqual([[1]]);
  });

  it('runEvidenceQuery returns a ≤ 2 KB summary, and failures as text', async () => {
    const text = await service.runEvidenceQuery(pid, `SELECT * FROM data.${tag} ORDER BY id`);
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(2048);
    expect(text.startsWith('more than 500 rows (first 500 fetched); columns: id (integer), nom (text), qte (numeric)')).toBe(true);
    const signs = await service.runEvidenceQuery(pid, `SELECT sign(qte) AS signe, count(*) AS n FROM data.${tag} GROUP BY 1 ORDER BY 1`);
    expect(signs).toBe('2 rows; columns: signe (numeric), n (bigint)\nsigne | n\n0 | 107\n1 | 643');
    expect(await service.runEvidenceQuery(pid, `DELETE FROM data.${tag}`)).toMatch(/^Query failed \(SQL_REJECTED\): This is a DELETE statement/);
  });
});
