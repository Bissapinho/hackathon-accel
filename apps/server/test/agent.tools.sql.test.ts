import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runSql, RUN_SQL_MAX_CHARS } from '../src/agent/tools/run_sql.js';
import type { AnyToolDef, ToolContext, ToolResult } from '../src/agent/tools/types.js';
import { buildTestApp, type TestApp } from './helpers.js';

// T-23: run_sql called directly with a ToolContext (seeded Ada, Ben and project "Kumo 2025"). O3.

let t: TestApp;
let ctx: ToolContext;
const tag = `t23_${Math.random().toString(36).slice(2, 8)}`;

const asMiniApp = (statements: string) =>
  t.db.connection().execute(async (conn) => {
    await sql`SET ROLE mini_app`.execute(conn);
    try {
      await sql.raw(statements).execute(conn);
    } finally {
      await sql`RESET ROLE`.execute(conn);
    }
  });

const rationale = { title: 'Check the data', why: 'Test' };
// As the loop does: parse the arguments with the tool's zod input, then run.
const call = (tool: AnyToolDef, args: object, c: ToolContext = ctx): Promise<ToolResult> =>
  tool.run(tool.input.parse({ rationale, ...args }), c);

beforeAll(async () => {
  t = await buildTestApp();
  const s = t.ctx.services;
  const project = await t.db.selectFrom('meta.projects').select('id').where('name', '=', 'Kumo 2025').executeTakeFirstOrThrow();
  ctx = {
    user: (await s.resources.getUserByEmail('ada@kumo.test'))!,
    projectId: project.id, sessionId: randomUUID(), mode: 'explore', services: s, semantics: s.semanticsPort,
  };
  await asMiniApp(`CREATE VIEW logic.${tag} AS SELECT g AS id, repeat('x', 300) AS long_text FROM generate_series(1, 3) g;`);
});

afterAll(async () => {
  await asMiniApp(`DROP VIEW IF EXISTS logic.${tag};`);
  await t.close();
});

describe('run_sql tool (T-23, O3)', () => {
  it('reads logic.* and returns a compact result with a plain summary', async () => {
    const res = await call(runSql, { sql: `SELECT id, long_text FROM logic.${tag} ORDER BY id` });
    expect(res).toMatchObject({ ok: true, summary: expect.stringMatching(/^3 rows \(2 columns, \d+ ms\)\.$/) });
    if (!res.ok) return;
    const r = res.result as { columns: unknown[]; rows: unknown[][]; rowCount: number; truncated: boolean };
    expect(r.columns).toEqual([{ name: 'id', type: 'integer' }, { name: 'long_text', type: 'text' }]);
    expect(r.rowCount).toBe(3);
    expect(r.truncated).toBe(false);
    expect((r.rows[0]![1] as string).length).toBeLessThanOrEqual(200); // long cells are cut
  });

  it('rejects DELETE, UPDATE, DROP and multi-statements with SQL_REJECTED, returned not thrown', async () => {
    for (const q of [`DELETE FROM logic.${tag}`, `UPDATE logic.${tag} SET id = 1`, `DROP VIEW logic.${tag}`, 'SELECT 1; SELECT 2']) {
      const res = await call(runSql, { sql: q });
      expect(res).toMatchObject({ ok: false, code: 'SQL_REJECTED', message: expect.any(String), hint: expect.any(String) });
    }
  });

  it('caps at 500 rows with truncated: true and keeps the result small', async () => {
    const res = await call(runSql, { sql: 'SELECT g, md5(g::text) AS h FROM generate_series(1, 600) g' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const r = res.result as { rows: unknown[][]; rowCount: number; truncated: boolean; hint?: string };
    expect(r.rowCount).toBe(500);
    expect(r.truncated).toBe(true);
    expect(r.hint).toMatch(/Aggregate/);
    expect(r.rows.length).toBeLessThan(500);
    expect(JSON.stringify(r.rows).length).toBeLessThanOrEqual(RUN_SQL_MAX_CHARS);
    expect(res.summary).toMatch(/^more than 500 rows, showing \d+/);
  });

  it('returns SQL_ERROR with a hint for a bad table', async () => {
    const res = await call(runSql, { sql: 'SELECT * FROM data.no_such_table_t23' });
    expect(res).toMatchObject({ ok: false, code: 'SQL_ERROR', hint: expect.any(String) });
  });

  it('lets a viewer read and refuses a project the user is not a member of', async () => {
    const ben = (await t.ctx.services.resources.getUserByEmail('ben@kumo.test'))!;
    expect(await call(runSql, { sql: 'SELECT 1 AS one' }, { ...ctx, user: ben })).toMatchObject({ ok: true, result: { rows: [[1]] } });
    expect(await call(runSql, { sql: 'SELECT 1' }, { ...ctx, projectId: randomUUID() })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('rejects an empty query at the argument check', () => {
    expect(runSql.input.safeParse({ rationale, sql: '   ' }).success).toBe(false);
  });
});
