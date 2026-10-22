import type { ColumnInfo, PipelineDef, WorkspaceDoc } from '@mini/shared';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { previewPipelineTool } from '../src/agent/tools/preview_pipeline.js';
import { withReadOnly } from '../src/db/readonly.js';
import { buildTestApp, loginAs, type TestApp } from './helpers.js';

// T-12 on a tiny Kumo-shaped order-lines table: 3 SO documents (6 lines) and 2 RMA documents (3 lines).
// W3 on kumo-mini itself (120 / 60) is checked once the fixture is loaded by the seed script (T-08).

let t: TestApp;
let projectId: string;
let adaId: string;
let datasetId: string;
const shortId = `t${Math.random().toString(36).slice(2, 9).padEnd(7, '0')}`.slice(0, 8);
const dsTable = `ds_${shortId}_v1`;
const createdTables: string[] = [`data.${dsTable}`];

const columns: ColumnInfo[] = [
  { name: 'No_Transaction', sqlName: 'no_transaction', type: 'string', nullable: false, sample: [] },
  { name: 'Quantite', sqlName: 'quantite', type: 'integer', nullable: false, sample: [] },
  { name: 'ID_Client', sqlName: 'id_client', type: 'string', nullable: true, sample: [] },
  { name: 'Code', sqlName: 'code', type: 'string', nullable: true, sample: [] },
];

const rows: [string, number, string | null, string][] = [
  ['SO-1', 2, 'C1', '1'],
  ['SO-1', 1, 'C1', '1'],
  ['SO-2', 5, 'C2', '1'],
  ['SO-2', 1, 'C2', '1'],
  ['SO-3', 3, 'C1', '1'],
  ['SO-3', 4, 'C1', '1'],
  ['RMA-1', -1, 'C1', '1'],
  ['RMA-1', -2, 'C1', '1'],
  ['RMA-2', -1, null, '99999999999999999999'], // too big for bigint: makes the "broken" pipeline fail in SQL
];

function rollup(apiName: string, prefix: string): PipelineDef {
  return {
    apiName,
    description: `${apiName} per document`,
    nodes: [
      { id: 'src', kind: 'source', datasetId: 'placeholder' },
      { id: 'f', kind: 'filter', input: 'src', where: { kind: 'cmp', property: 'no_transaction', op: 'startsWith', value: prefix } },
      {
        id: 'docs',
        kind: 'aggregate',
        input: 'f',
        groupBy: ['no_transaction'],
        measures: [
          { as: 'lignes', fn: 'count' },
          { as: 'quantite', fn: 'sum', column: 'quantite' },
        ],
      },
    ],
    outputs: [{ apiName, node: 'docs' }],
    checks: [{ output: apiName, kind: 'unique', columns: ['no_transaction'] }],
  };
}

let commandes: PipelineDef;
let retours: PipelineDef;
let lignes: PipelineDef;
let broken: PipelineDef;

beforeAll(async () => {
  t = await buildTestApp();
  await t.app.ready();
  adaId = (await t.db.selectFrom('meta.users').select('id').where('email', '=', 'ada@kumo.test').executeTakeFirstOrThrow()).id;
  projectId = (
    await t.db.insertInto('meta.projects').values({ name: `pipelines test ${shortId}`, created_by: adaId }).returning('id').executeTakeFirstOrThrow()
  ).id;
  await t.db.insertInto('meta.project_members').values({ project_id: projectId, user_id: adaId, role: 'owner' }).execute();

  await sql`CREATE TABLE ${sql.id('data', dsTable)} (no_transaction text, quantite bigint, id_client text, code text, _row integer)`.execute(t.db);
  for (const [i, r] of rows.entries()) {
    await sql`INSERT INTO ${sql.id('data', dsTable)} VALUES (${r[0]}, ${r[1]}, ${r[2]}, ${r[3]}, ${i + 1})`.execute(t.db);
  }
  await sql`GRANT SELECT ON ${sql.id('data', dsTable)} TO mini_reader`.execute(t.db);
  datasetId = (
    await sql<{ id: string }>`INSERT INTO meta.datasets (project_id, short_id, name, current_version, created_by)
      VALUES (${projectId}, ${shortId}, 'COMMANDES_NETSUITE_2025', 1, ${adaId}) RETURNING id`.execute(t.db)
  ).rows[0]!.id;
  await sql`INSERT INTO meta.dataset_versions (dataset_id, version, transaction_type, table_name, row_count, columns, source_file, created_by)
    VALUES (${datasetId}, 1, 'SNAPSHOT', ${`data.${dsTable}`}, ${rows.length}, ${JSON.stringify(columns)}, 'test.csv', ${adaId})`.execute(t.db);

  const withSource = (p: PipelineDef): PipelineDef => ({
    ...p,
    nodes: p.nodes.map((n) => (n.kind === 'source' ? { ...n, datasetId } : n)),
  });
  commandes = withSource(rollup('commandes', 'SO-'));
  retours = withSource(rollup('retours', 'RMA-'));
  lignes = {
    apiName: 'lignes',
    description: 'raw lines',
    nodes: [{ id: 'src', kind: 'source', datasetId }],
    outputs: [{ apiName: 'lignes', node: 'src' }],
    checks: [{ output: 'lignes', kind: 'unique', columns: ['no_transaction'] }],
  };
  broken = {
    apiName: 'broken',
    description: 'cast overflow',
    nodes: [
      { id: 'src', kind: 'source', datasetId },
      { id: 'n', kind: 'cast', input: 'src', column: 'code', to: 'integer' },
    ],
    outputs: [{ apiName: 'broken', node: 'n' }],
    checks: [],
  };
  const doc: WorkspaceDoc = {
    semanticVersion: 'v0',
    pipelines: [commandes, retours, lignes, broken],
    objectTypes: [],
    linkTypes: [],
    logic: [],
    actionTypes: [],
    apps: [],
    automations: [],
  };
  await sql`INSERT INTO meta.workspace_drafts (project_id, doc) VALUES (${projectId}, ${JSON.stringify(doc)})`.execute(t.db);
});

afterAll(async () => {
  for (const table of createdTables) await sql.raw(`DROP TABLE IF EXISTS ${table}`).execute(t.db);
  await t.db.deleteFrom('meta.projects').where('id', '=', projectId).execute();
  await t.close();
});

describe('T-12 preview (W3 shape)', () => {
  it('previews commandes through the API: one row per SO document, checks pass', async () => {
    const cookie = await loginAs(t.app, 'ada@kumo.test');
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/workspace/draft/pipelines/commandes/preview`,
      headers: { cookie },
      payload: { limit: 2 },
    });
    expect(res.statusCode).toBe(200);
    const p = res.json();
    expect(p.rowCount).toBe(3);
    expect(p.rows).toHaveLength(2);
    expect(p.columns).toEqual([
      { name: 'no_transaction', type: 'string' },
      { name: 'lignes', type: 'integer' },
      { name: 'quantite', type: 'integer' },
    ]);
    expect(p.nodeCounts).toEqual({ src: 9, f: 6, docs: 3 });
    expect(p.checks).toEqual([expect.objectContaining({ ok: true })]);
    expect(typeof p.rows[0][1]).toBe('number');
  });

  it('previews retours: 2 RMA documents with negative totals', async () => {
    const p = await t.ctx.services.pipelines.previewDraftPipeline(projectId, 'retours', { limit: 50 });
    expect(p.rowCount).toBe(2);
    const byDoc = Object.fromEntries(p.rows.map((r) => [r[0], r[2]]));
    expect(byDoc).toEqual({ 'RMA-1': -3, 'RMA-2': -1 });
  });

  it('previews one node on request', async () => {
    const p = await t.ctx.services.pipelines.previewDraftPipeline(projectId, 'commandes', { node: 'f' });
    expect(p.rowCount).toBe(6);
  });

  it('unknown pipeline is NOT_FOUND and lists the draft pipelines', async () => {
    await expect(t.ctx.services.pipelines.previewDraftPipeline(projectId, 'nope')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: expect.stringContaining('commandes'),
    });
  });

  it('a node failing in SQL is named: PIPELINE_SQL_ERROR', async () => {
    await expect(t.ctx.services.pipelines.previewDraftPipeline(projectId, 'broken')).rejects.toMatchObject({
      code: 'PIPELINE_SQL_ERROR',
      message: expect.stringContaining('"n"'),
    });
  });
});

describe('T-12 data validation (W2 pipeline codes)', () => {
  it('unique(no_transaction) on the line table fails with a count and examples', async () => {
    const errors = await t.ctx.services.pipelines.validatePipelineData(projectId, lignes, 'pipelines[2]');
    expect(errors).toEqual([
      expect.objectContaining({ path: 'pipelines[2].checks[0]', code: 'PIPELINE_CHECK_FAILED', message: expect.stringMatching(/4 values of \(no_transaction\).*e\.g\./) }),
    ]);
  });

  it('a cycle is reported without touching the data', async () => {
    const loop: PipelineDef = {
      ...commandes,
      nodes: [
        { id: 'a', kind: 'filter', input: 'b', where: { kind: 'cmp', property: 'x', op: 'isNull' } },
        { id: 'b', kind: 'filter', input: 'a', where: { kind: 'cmp', property: 'x', op: 'isNull' } },
      ],
      outputs: [{ apiName: 'commandes', node: 'a' }],
      checks: [],
    };
    const errors = await t.ctx.services.pipelines.validatePipelineData(projectId, loop);
    expect(errors.map((e) => e.code)).toEqual(['PIPELINE_CYCLE']);
  });

  it('valid pipelines have no data errors', async () => {
    expect(await t.ctx.services.pipelines.validatePipelineData(projectId, commandes)).toEqual([]);
  });
});

describe('T-12 build (called by publish)', () => {
  it('materializes the output, records the build, skips when up to date, rebuilds on change', async () => {
    const svc = t.ctx.services.pipelines;
    const [first] = await svc.buildPipeline(t.db, { projectId, def: commandes, workspaceVersion: 1 });
    createdTables.push(first!.tableName);
    expect(first).toMatchObject({ status: 'built', rowCount: 3, tableName: 'data.pl_commandes_commandes_v1', inputVersions: { [datasetId]: 1 } });
    expect(first!.checks).toEqual([expect.objectContaining({ ok: true })]);

    // mini_reader (agent SQL) can read the output.
    const count = await withReadOnly({ timeoutMs: 2000 }, (db) =>
      sql<{ n: number }>`SELECT count(*)::int AS n FROM data.pl_commandes_commandes_v1`.execute(db),
    );
    expect(count.rows[0]!.n).toBe(3);

    const [second] = await svc.buildPipeline(t.db, { projectId, def: commandes, workspaceVersion: 2 });
    expect(second).toMatchObject({ status: 'upToDate', tableName: first!.tableName, rowCount: 3, workspaceVersion: 2 });

    const changed: PipelineDef = { ...commandes, description: 'changed' };
    const [third] = await svc.buildPipeline(t.db, { projectId, def: changed, workspaceVersion: 3 });
    createdTables.push(third!.tableName);
    expect(third).toMatchObject({ status: 'built', tableName: 'data.pl_commandes_commandes_v2' });

    const builds = await svc.listBuilds(projectId);
    expect(builds.map((b) => b.status)).toEqual(['built', 'upToDate', 'built']);

    const cookie = await loginAs(t.app, 'ada@kumo.test');
    const res = await t.app.inject({ method: 'GET', url: `/api/projects/${projectId}/pipelines/builds?limit=2`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(2);
  });

  it('a failing check marks the build failed', async () => {
    const [b] = await t.ctx.services.pipelines.buildPipeline(t.db, { projectId, def: lignes, workspaceVersion: 1 });
    createdTables.push(b!.tableName);
    expect(b).toMatchObject({ status: 'failed', rowCount: 9 });
    expect(b!.checks[0]!.ok).toBe(false);
  });
});

describe('preview_pipeline tool', () => {
  const ctx = () => ({
    user: { id: adaId, email: 'ada@kumo.test', displayName: 'Ada' },
    projectId,
    sessionId: '00000000-0000-4000-8000-000000000000',
    mode: 'build' as const,
    services: t.ctx.services,
    semantics: t.ctx.semantics,
  });
  const rationale = { title: 'Preview orders', why: 'Check one row per order' };

  it('returns rows and a summary', async () => {
    const input = previewPipelineTool.input.parse({ rationale, pipeline: 'commandes' });
    const r = await previewPipelineTool.run(input, ctx());
    expect(r).toMatchObject({ ok: true, summary: '3 rows; all 1 checks pass' });
  });

  it('returns errors instead of throwing', async () => {
    const input = previewPipelineTool.input.parse({ rationale, pipeline: 'nope' });
    const r = await previewPipelineTool.run(input, ctx());
    expect(r).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});
