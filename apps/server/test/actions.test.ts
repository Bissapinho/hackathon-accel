import type { ActionRunResponse } from '@mini/shared';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getActionLogTool } from '../src/agent/tools/get_action_log.js';
import { runActionTool } from '../src/agent/tools/run_action.js';
import { testActionTool } from '../src/agent/tools/test_action.js';
import type { ToolContext } from '../src/agent/tools/types.js';
import { stubSemanticsPort } from '../src/ports.js';
import { rebuildLots, setupActionsWorld, teardownActionsWorld, type ActionsWorld } from './actions-world.js';
import { buildTestApp, loginAs, type TestApp } from './helpers.js';

let t: TestApp;
let w: ActionsWorld;
let ada: string;
let ben: string;

beforeAll(async () => {
  t = await buildTestApp();
  w = await setupActionsWorld(t.db);
  ada = await loginAs(t.app, 'ada@kumo.test');
  ben = await loginAs(t.app, 'ben@kumo.test');
});
afterAll(async () => {
  await teardownActionsWorld(t.db);
  await t.close();
});

const run = (body: unknown, cookie = ada, action = 'ReaffecterProduction') =>
  t.app.inject({ method: 'POST', url: `/api/projects/${w.projectId}/actions/${action}/run`, headers: { cookie }, payload: body as object });

async function lot(id: string) {
  const r = await sql<{ lieu_production: string }>`SELECT lieu_production FROM ont.lot_production WHERE lot_id = ${id}`.execute(t.db);
  return r.rows[0]?.lieu_production;
}
async function charge(id: string) {
  const r = await sql<{ charge: number; surcharge: boolean }>`SELECT charge, surcharge FROM logic.cuisine_jour WHERE id = ${id}`.execute(t.db);
  return r.rows[0]!;
}
async function editsCount() {
  const r = await sql<{ n: number }>`SELECT count(*)::int AS n FROM edits.lot_production`.execute(t.db);
  return r.rows[0]!.n;
}
async function runs(dry: boolean) {
  return t.db
    .selectFrom('meta.action_runs')
    .selectAll()
    .where('project_id', '=', w.projectId)
    .where('dry_run', '=', dry)
    .orderBy('created_at')
    .execute();
}

describe('A1 — ReaffecterProduction dry-run then apply', () => {
  it('dry-run is valid and writes nothing but a dry log row', async () => {
    const res = await run({ params: { lot: { objectType: 'LotProduction', primaryKey: 'LOT-1' }, cuisineCible: 'Gennevilliers' }, dryRun: true });
    expect(res.statusCode).toBe(200);
    const body = res.json<ActionRunResponse>();
    expect(body.status).toBe('valid');
    expect(body.edits).toEqual([
      {
        ref: { objectType: 'LotProduction', primaryKey: 'LOT-1' },
        op: 'modify',
        before: { lieuProduction: 'Frepillon' },
        after: { lieuProduction: 'Gennevilliers' },
      },
    ]);
    expect(await lot('LOT-1')).toBe('Frepillon');
    expect(await editsCount()).toBe(0);
    expect(await runs(true)).toHaveLength(1);
    expect(await runs(false)).toHaveLength(0);
  });

  it('apply moves the lot; both kitchen-days change by 6; one log entry with before/after', async () => {
    const before = { f: await charge('Frepillon|2025-10-14'), g: await charge('Gennevilliers|2025-10-14') };
    const res = await run({ params: { lot: 'LOT-1', cuisineCible: 'Gennevilliers' } });
    expect(res.statusCode).toBe(200);
    const body = res.json<ActionRunResponse>();
    expect(body.status).toBe('applied');
    expect(body.message).toBe('Lot LOT-1 is now produced in Gennevilliers.');

    expect(await lot('LOT-1')).toBe('Gennevilliers');
    expect((await charge('Frepillon|2025-10-14')).charge).toBe(before.f.charge - 6);
    expect((await charge('Gennevilliers|2025-10-14')).charge).toBe(before.g.charge + 6);

    const applied = await runs(false);
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({ status: 'applied', via: 'ui', workspace_version: 1, action_api_name: 'ReaffecterProduction' });
    expect(applied[0]!.edits).toEqual([
      { objectType: 'LotProduction', primaryKey: 'LOT-1', op: 'modify', before: { lieuProduction: 'Frepillon' }, after: { lieuProduction: 'Gennevilliers' } },
    ]);
    // Rule 8: the source table is untouched.
    const src = await sql<{ lieu_production: string }>`SELECT lieu_production FROM data.act_lots_v1 WHERE lot_id = 'LOT-1'`.execute(t.db);
    expect(src.rows[0]!.lieu_production).toBe('Frepillon');
  });

  it('the log is filterable by object', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/projects/${w.projectId}/actions/log?objectType=LotProduction&primaryKey=LOT-1`,
      headers: { cookie: ben },
    });
    expect(res.statusCode).toBe(200);
    const entries = res.json();
    expect(entries.map((e: { status: string }) => e.status)).toEqual(['applied', 'valid']);
    expect(entries[0].runBy.displayName).toBe('Ada');
    const none = await t.app.inject({
      method: 'GET',
      url: `/api/projects/${w.projectId}/actions/log?objectType=LotProduction&primaryKey=LOT-3`,
      headers: { cookie: ada },
    });
    expect(none.json()).toEqual([]);
  });
});

describe('A2 — the capacity criterion is evaluated after the edits', () => {
  it('moving 15 units to Gennevilliers is rejected with the criterion message; nothing written', async () => {
    const editsBefore = await editsCount();
    const res = await run({ params: { lot: 'LOT-2', cuisineCible: 'Gennevilliers' } });
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.code).toBe('ACTION_REJECTED');
    expect(body.status).toBe('rejected');
    expect(body.message).toBe('Gennevilliers would be over capacity on 2025-10-14 (31 for 20).');
    expect(body.errors[0]).toMatchObject({ path: 'submissionCriteria[1]', code: 'CRITERION_FAILED' });
    expect(await lot('LOT-2')).toBe('Frepillon');
    expect(await editsCount()).toBe(editsBefore);
    expect((await charge('Gennevilliers|2025-10-14')).surcharge).toBe(false);
  });

  it('a before-edit criterion and a missing lookup explain themselves', async () => {
    const same = await run({ params: { lot: 'LOT-1', cuisineCible: 'Gennevilliers' } });
    expect(same.statusCode).toBe(422);
    expect(same.json().message).toBe('The lot is already produced in Gennevilliers.');

    const noDay = await run({ params: { lot: 'LOT-4', cuisineCible: 'Gennevilliers' } });
    expect(noDay.statusCode).toBe(422);
    expect(noDay.json().errors[0]).toMatchObject({ code: 'OBJECT_NOT_FOUND' });
    // jsonb stores the lookup keys in its own order, so only the content is checked.
    expect(noDay.json().message).toMatch(/^No CuisineJour matches /);
    expect(noDay.json().message).toContain('lieu = Gennevilliers');
    expect(noDay.json().message).toContain('date = 2025-10-15');
  });

  it('bad parameters are rejected with field paths', async () => {
    const res = await run({ params: { lot: 'NOPE', cuisineCible: 'Lyon' } });
    expect(res.statusCode).toBe(422);
    expect(res.json().errors.map((e: { path: string; code: string }) => `${e.path}:${e.code}`).sort()).toEqual([
      'params.cuisineCible:NOT_ALLOWED_VALUE',
      'params.lot:OBJECT_NOT_FOUND',
    ]);
  });
});

describe('A3 — DeclarerInvendus creates a linked object', () => {
  it('creates an Invendu that appears in ont and next to its client and article', async () => {
    const res = await run(
      { params: { client: 'C0421', article: 'ART-1', quantite: 4, reference: 'INV-1' } },
      ada,
      'DeclarerInvendus',
    );
    expect(res.statusCode).toBe(200);
    const body = res.json<ActionRunResponse>();
    expect(body.status).toBe('applied');
    expect(body.message).toBe('4 unsold units of Poké Saumon recorded for Magasin A.');
    expect(body.edits[0]).toMatchObject({ op: 'create', ref: { objectType: 'Invendu', primaryKey: 'INV-1' }, before: {} });
    expect(body.edits[0]!.after).toMatchObject({ client: 'C0421', article: 'ART-1', quantite: 4, declarePar: 'Ada' });

    const linked = await sql<{ nom: string; libelle: string; quantite: number }>`
      SELECT c.nom, a.libelle, i.quantite FROM ont.invendu i
      JOIN ont.client c ON c.code_client = i.client JOIN ont.article a ON a.code_article = i.article`.execute(t.db);
    expect(linked.rows).toEqual([{ nom: 'Magasin A', libelle: 'Poké Saumon', quantite: 4 }]);

    const again = await run({ params: { client: 'C0421', article: 'ART-1', quantite: 1, reference: 'INV-1' } }, ada, 'DeclarerInvendus');
    expect(again.statusCode).toBe(422);
    expect(again.json().errors[0].code).toBe('OBJECT_ALREADY_EXISTS');
  });
});

describe('A4 — edits survive a pipeline rebuild', () => {
  it('re-pointing ont.lot_production at a rebuilt table keeps the moved lot and the counts', async () => {
    const count = async () => (await sql<{ n: number }>`SELECT count(*)::int AS n FROM ont.lot_production`.execute(t.db)).rows[0]!.n;
    const n = await count();
    await rebuildLots(t.db);
    expect(await lot('LOT-1')).toBe('Gennevilliers');
    expect(await count()).toBe(n);
  });
});

describe('A5 — permissions', () => {
  it('a viewer cannot run actions', async () => {
    const res = await run({ params: { lot: 'LOT-3', cuisineCible: 'Frepillon' }, dryRun: true }, ben);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('FORBIDDEN');
  });
});

describe('draft test route', () => {
  it('dry-runs a draft-only action against published objects and writes no edits', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/projects/${w.projectId}/workspace/draft/actions/AnnulerLot/test`,
      headers: { cookie: ada },
      payload: { params: { lot: 'LOT-3' } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'valid', edits: [{ op: 'delete', ref: { primaryKey: 'LOT-3' } }] });
    expect(await lot('LOT-3')).toBe('Gennevilliers');
    const logged = await t.db.selectFrom('meta.action_runs').select(['workspace_version', 'dry_run']).where('action_api_name', '=', 'AnnulerLot').execute();
    expect(logged).toEqual([{ workspace_version: 0, dry_run: true }]);

    const unpublished = await run({ params: { lot: 'LOT-3' } }, ada, 'AnnulerLot');
    expect(unpublished.statusCode).toBe(404);
    expect(unpublished.json().hint).toMatch(/ReaffecterProduction/);
  });
});

describe('agent tools', () => {
  const ctx = (): ToolContext => ({
    user: { id: w.ownerId, email: 'ada@kumo.test', displayName: 'Ada' },
    projectId: w.projectId,
    sessionId: '00000000-0000-4000-8000-0000000000aa',
    mode: 'build',
    services: t.ctx.services,
    semantics: stubSemanticsPort,
  });
  const rationale = { title: 'Test', why: 'Testing the tool' };

  it('run_action summarizes for the approval card and runs as the agent', async () => {
    const input = runActionTool.input.parse({ rationale, action: 'ReaffecterProduction', params: { lot: 'LOT-3', cuisineCible: 'Frepillon' } });
    expect(await runActionTool.summarize!(input, ctx())).toBe("Run 'Réaffecter une production' on LotProduction LOT-3, Cuisine cible: Frepillon");
    const res = await runActionTool.run(input, ctx());
    expect(res).toMatchObject({ ok: true });
    expect(await lot('LOT-3')).toBe('Frepillon');
    const row = await t.db
      .selectFrom('meta.action_runs')
      .select(['via', 'agent_session_id'])
      .where('project_id', '=', w.projectId)
      .where('dry_run', '=', false)
      .orderBy('created_at', 'desc')
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ via: 'agent', agent_session_id: ctx().sessionId });
  });

  it('test_action reports a refusal as a normal result; unknown actions as a tool error', async () => {
    const refused = await testActionTool.run(
      testActionTool.input.parse({ rationale, action: 'ReaffecterProduction', params: { lot: 'LOT-2', cuisineCible: 'Gennevilliers' } }),
      ctx(),
    );
    expect(refused.ok).toBe(true);
    if (refused.ok) expect(refused.summary).toMatch(/refused — Gennevilliers would be over capacity/);

    const unknown = await testActionTool.run(testActionTool.input.parse({ rationale, action: 'Nope', params: {} }), ctx());
    expect(unknown).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('get_action_log lists runs, filterable by action', async () => {
    const res = await getActionLogTool.run(getActionLogTool.input.parse({ rationale, action: 'DeclarerInvendus' }), ctx());
    expect(res.ok).toBe(true);
    if (res.ok) {
      const entries = res.result as { action: string }[];
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.every((e) => e.action === 'DeclarerInvendus')).toBe(true);
    }
  });

  it('a viewer gets FORBIDDEN from run_action', async () => {
    const viewerCtx = { ...ctx(), user: { id: w.viewerId, email: 'ben@kumo.test', displayName: 'Ben' } };
    const res = await runActionTool.run(runActionTool.input.parse({ rationale, action: 'ReaffecterProduction', params: {} }), viewerCtx);
    expect(res).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});
