import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { diffDraft } from '../src/agent/tools/diff_draft.js';
import { editDraft } from '../src/agent/tools/edit_draft.js';
import { getWorkspace } from '../src/agent/tools/get_workspace.js';
import type { ToolContext } from '../src/agent/tools/types.js';
import { validateDraft } from '../src/agent/tools/validate_draft.js';
import { docToOps } from '../src/modules/workspace/ops.js';
import { stubSemanticsPort } from '../src/ports.js';
import { DS, kumoCatalog, kumoWorkspace } from './fixtures/workspace-kumo.js';
import { buildTestApp, loginAs, type TestApp } from './helpers.js';

// T-11 / T-13 through the API and the agent tools, on the local test database.

let t: TestApp;
let pid: string;
let ada: string;
let ben: string;
const rationale = { title: 'Test', why: 'Test' };

async function insertDatasets(app: TestApp, projectId: string, userId: string) {
  const ids = Object.entries(DS);
  const catalog = kumoCatalog();
  for (const [name, id] of ids) {
    await app.db
      .insertInto('meta.datasets')
      .values({ id, project_id: projectId, short_id: `wsfx${name.slice(0, 4)}`.padEnd(8, '0').slice(0, 8), name: `ws_fixture_${name}`, current_version: 1, created_by: userId })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute();
    await app.db
      .insertInto('meta.dataset_versions')
      .values({
        dataset_id: id,
        version: 1,
        transaction_type: 'SNAPSHOT',
        table_name: `data.ds_wsfx_${name}_v1`,
        row_count: 0,
        columns: JSON.stringify(catalog.get(id)!.map((c) => ({ name: c.sqlName, sqlName: c.sqlName, type: c.type, nullable: true, sample: [] }))),
        source_file: 'test',
        created_by: userId,
      })
      .onConflict((oc) => oc.columns(['dataset_id', 'version']).doNothing())
      .execute();
  }
}

beforeAll(async () => {
  t = await buildTestApp();
  const p = await t.db.selectFrom('meta.projects').select(['id', 'created_by']).where('name', '=', 'Kumo 2025').executeTakeFirstOrThrow();
  pid = p.id;
  await insertDatasets(t, pid, p.created_by);
  ada = await loginAs(t.app, 'ada@kumo.test');
  ben = await loginAs(t.app, 'ben@kumo.test');
});

beforeEach(async () => {
  await t.db.deleteFrom('meta.workspace_drafts').where('project_id', '=', pid).execute();
});

afterAll(async () => {
  await t.db.deleteFrom('meta.workspace_drafts').where('project_id', '=', pid).execute();
  await t.db.deleteFrom('meta.datasets').where('id', 'in', Object.values(DS)).execute();
  await t.close();
});

const patch = (cookie: string, body: object) =>
  t.app.inject({ method: 'PATCH', url: `/api/projects/${pid}/workspace/draft`, headers: { cookie }, payload: body });

describe('workspace draft API', () => {
  it('creates the draft lazily on the active semantic version', async () => {
    const res = await t.app.inject({ method: 'GET', url: `/api/projects/${pid}/workspace?version=draft`, headers: { cookie: ben } });
    expect(res.statusCode).toBe(200);
    expect(res.json().draft).toMatchObject({ revision: 0, baseVersion: 0, semVersion: 'v0', doc: { semanticVersion: 'v0', objectTypes: [] } });
  });

  it('nothing published yet: version=latest is 404 with a hint', async () => {
    const res = await t.app.inject({ method: 'GET', url: `/api/projects/${pid}/workspace`, headers: { cookie: ada } });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'NOT_FOUND', hint: expect.stringMatching(/draft/) });
  });

  it('applying the Kumo document as ops yields the same doc, valid, and the diff lists additions', async () => {
    const res = await patch(ada, { expectedRevision: 0, ops: docToOps(kumoWorkspace()) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ revision: 1, validation: { errors: [], warnings: [] } });

    const draft = (await t.app.inject({ method: 'GET', url: `/api/projects/${pid}/workspace?version=draft`, headers: { cookie: ada } })).json().draft;
    expect(draft.doc).toEqual(kumoWorkspace());

    const diff = (await t.app.inject({ method: 'GET', url: `/api/projects/${pid}/workspace/draft/diff`, headers: { cookie: ada } })).json();
    expect(diff.added).toHaveLength(12);
    expect(diff.removed).toEqual([]);
  });

  it('a stale revision is 409 VERSION_CONFLICT and leaves the draft unchanged', async () => {
    await patch(ada, { expectedRevision: 0, ops: [{ op: 'setSemanticVersion', version: 'v0' }] });
    const res = await patch(ada, { expectedRevision: 0, ops: [{ op: 'setSemanticVersion', version: 'v7' }] });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('VERSION_CONFLICT');
    const draft = (await t.app.inject({ method: 'GET', url: `/api/projects/${pid}/workspace?version=draft`, headers: { cookie: ada } })).json().draft;
    expect(draft).toMatchObject({ revision: 1, semVersion: 'v0' });
  });

  it('a viewer cannot edit; a malformed op is 400; an op on a missing entity is 422', async () => {
    expect((await patch(ben, { expectedRevision: 0, ops: [{ op: 'setSemanticVersion', version: 'v0' }] })).statusCode).toBe(403);
    const bad = await patch(ada, { expectedRevision: 0, ops: [{ op: 'upsertPipeline', value: { apiName: 'x' } }] });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('VALIDATION_FAILED');
    const missing = await patch(ada, { expectedRevision: 0, ops: [{ op: 'remove', kind: 'objectType', apiName: 'Ghost' }] });
    expect(missing.statusCode).toBe(422);
    expect(missing.json().details[0].path).toBe('ops[0]');
  });

  it('validate stores and returns errors; discard resets to the published (empty) doc', async () => {
    const doc = kumoWorkspace();
    doc.objectTypes[0]!.description = '';
    await patch(ada, { expectedRevision: 0, ops: docToOps(doc) });
    const v = await t.app.inject({ method: 'POST', url: `/api/projects/${pid}/workspace/draft/validate`, headers: { cookie: ada } });
    expect(v.json().errors).toContainEqual(expect.objectContaining({ code: 'MISSING_DESCRIPTION' }));

    const d = await t.app.inject({ method: 'POST', url: `/api/projects/${pid}/workspace/draft/discard`, headers: { cookie: ada } });
    expect(d.json()).toEqual({ revision: 2 });
    const draft = (await t.app.inject({ method: 'GET', url: `/api/projects/${pid}/workspace?version=draft`, headers: { cookie: ada } })).json().draft;
    expect(draft.doc.objectTypes).toEqual([]);
  });

  it('a dataset column that does not exist is caught on PATCH', async () => {
    const doc = kumoWorkspace();
    doc.objectTypes[1]!.properties[1]!.column = 'raison_sociale';
    const res = await patch(ada, { expectedRevision: 0, ops: docToOps(doc) });
    expect(res.json().validation.errors).toContainEqual(expect.objectContaining({ code: 'UNKNOWN_REFERENCE', path: 'objectTypes[1].properties[1].column' }));
  });

  it('history is empty before any publish', async () => {
    const res = await t.app.inject({ method: 'GET', url: `/api/projects/${pid}/workspace/history`, headers: { cookie: ben } });
    expect(res.json()).toEqual([]);
  });
});

describe('semantic references through an injected port', () => {
  it('reports a missing term as UNKNOWN_REFERENCE', async () => {
    const app = await buildTestApp({ semantics: { ...stubSemanticsPort, recordExists: async (_p, _v, id) => id !== 'T_client' } });
    try {
      const cookie = await loginAs(app.app, 'ada@kumo.test');
      const res = await app.app.inject({ method: 'PATCH', url: `/api/projects/${pid}/workspace/draft`, headers: { cookie }, payload: { expectedRevision: 0, ops: docToOps(kumoWorkspace()) } });
      expect(res.json().validation.errors).toEqual([expect.objectContaining({ code: 'UNKNOWN_REFERENCE', path: 'objectTypes[1].term' })]);
    } finally {
      await app.close();
    }
  });
});

describe('workspace agent tools', () => {
  const ctxFor = async (email: string): Promise<ToolContext> => {
    const user = (await t.ctx.services.resources.getUserByEmail(email))!;
    return { user, projectId: pid, sessionId: '00000000-0000-4000-8000-000000000001', mode: 'build', services: t.ctx.services, semantics: stubSemanticsPort };
  };

  it('edit_draft → validate_draft → diff_draft → get_workspace', async () => {
    const ctx = await ctxFor('ada@kumo.test');
    const edit = await editDraft.run(editDraft.input.parse({ rationale, expectedRevision: 0, ops: docToOps(kumoWorkspace()) }), ctx);
    expect(edit).toMatchObject({ ok: true, summary: expect.stringMatching(/revision 1: no problems/) });

    const val = await validateDraft.run({ rationale }, ctx);
    expect(val).toMatchObject({ ok: true, summary: expect.stringMatching(/publishable/) });

    const diff = await diffDraft.run({ rationale }, ctx);
    expect(diff).toMatchObject({ ok: true, summary: expect.stringMatching(/add 12/) });

    const inv = await getWorkspace.run(getWorkspace.input.parse({ rationale, which: 'draft', inventoryOnly: true }), ctx);
    expect(inv.ok && (inv.result as { inventory: { objectTypes: unknown[] } }).inventory.objectTypes).toHaveLength(4);

    const one = await getWorkspace.run(getWorkspace.input.parse({ rationale, which: 'draft', entity: { kind: 'logic', apiName: 'surcharge' } }), ctx);
    expect(one).toMatchObject({ ok: true, result: { kind: 'rule', objectType: 'CuisineJour' } });
  });

  it('errors are returned, not thrown: stale revision and viewer', async () => {
    const stale = await editDraft.run(editDraft.input.parse({ rationale, expectedRevision: 5, ops: [{ op: 'setSemanticVersion', version: 'v0' }] }), await ctxFor('ada@kumo.test'));
    expect(stale).toMatchObject({ ok: false, code: 'VERSION_CONFLICT' });
    const viewer = await editDraft.run(editDraft.input.parse({ rationale, expectedRevision: 0, ops: [{ op: 'setSemanticVersion', version: 'v0' }] }), await ctxFor('ben@kumo.test'));
    expect(viewer).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});
