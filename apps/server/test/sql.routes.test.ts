import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerSqlRoutes } from '../src/modules/sql/routes.js';
import { buildSqlServices } from '../src/modules/sql/service.js';
import { buildTestApp, loginAs, type TestApp } from './helpers.js';

// T-16 route: POST /api/projects/:pid/sql. The routes are registered here on the test app, until
// register.alfred.ts wires them.

let t: TestApp;
let projectId: string;
let ada: string;
let ben: string;
const tag = `t16r_${Math.random().toString(36).slice(2, 8)}`;

const asMiniApp = (statements: string) =>
  t.db.connection().execute(async (conn) => {
    await sql`SET ROLE mini_app`.execute(conn);
    try {
      await sql.raw(statements).execute(conn);
    } finally {
      await sql`RESET ROLE`.execute(conn);
    }
  });

const post = (pid: string, body: unknown, cookie?: string) =>
  t.app.inject({ method: 'POST', url: `/api/projects/${pid}/sql`, payload: body as object, headers: cookie ? { cookie } : {} });

beforeAll(async () => {
  t = await buildTestApp();
  registerSqlRoutes(t.app, { ...buildSqlServices(t.ctx), resources: t.ctx.services.resources });
  await t.app.ready();
  const p = await t.db.selectFrom('meta.projects').select('id').where('name', '=', 'Kumo 2025').executeTakeFirstOrThrow();
  projectId = p.id;
  ada = await loginAs(t.app, 'ada@kumo.test');
  ben = await loginAs(t.app, 'ben@kumo.test');
  await asMiniApp(`CREATE VIEW logic.${tag} AS SELECT g AS id, g % 2 = 0 AS pair FROM generate_series(1, 3) g;`);
});

afterAll(async () => {
  await asMiniApp(`DROP VIEW IF EXISTS logic.${tag};`);
  await t.close();
});

describe('POST /api/projects/:pid/sql (T-16, O3)', () => {
  it('returns a SqlResponse from logic.*', async () => {
    const res = await post(projectId, { sql: `SELECT id, pair FROM logic.${tag} ORDER BY id` }, ada);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({
      columns: [
        { name: 'id', type: 'integer' },
        { name: 'pair', type: 'boolean' },
      ],
      rows: [
        [1, false],
        [2, true],
        [3, false],
      ],
      truncated: false,
      ms: expect.any(Number),
    });
  });

  it('a viewer can read too', async () => {
    const res = await post(projectId, { sql: 'SELECT 1 AS one' }, ben);
    expect(res.statusCode).toBe(200);
    expect(res.json().rows).toEqual([[1]]);
  });

  it('caps at 500 rows with truncated: true', async () => {
    const res = await post(projectId, { sql: 'SELECT g FROM generate_series(1, 501) g' }, ada);
    expect(res.statusCode).toBe(200);
    expect(res.json().rows).toHaveLength(500);
    expect(res.json().truncated).toBe(true);
  });

  it('rejects writes and multi-statements with SQL_REJECTED', async () => {
    for (const q of [`DELETE FROM logic.${tag}`, `UPDATE logic.${tag} SET pair = true`, `DROP VIEW logic.${tag}`, 'SELECT 1; SELECT 2']) {
      const res = await post(projectId, { sql: q }, ada);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'SQL_REJECTED', message: expect.any(String), hint: expect.any(String) });
    }
  });

  it('stops a 6-second query with SQL_TIMEOUT', async () => {
    const res = await post(projectId, { sql: 'SELECT pg_sleep(6)' }, ada);
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: 'SQL_TIMEOUT', hint: expect.any(String) });
  }, 15_000);

  it('validates the body', async () => {
    const res = await post(projectId, { sql: '   ' }, ada);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_FAILED', details: [expect.objectContaining({ path: 'sql' })] });
  });

  it('needs a login and project membership', async () => {
    expect((await post(projectId, { sql: 'SELECT 1' })).statusCode).toBe(401);
    const res = await post(randomUUID(), { sql: 'SELECT 1' }, ada);
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
  });
});
