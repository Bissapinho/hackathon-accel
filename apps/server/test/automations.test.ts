import type { ActionTypeDef, AutomationDef, WorkspaceDoc } from '@mini/shared';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { disableAutomationTool } from '../src/agent/tools/disable_automation.js';
import { enableAutomationTool } from '../src/agent/tools/enable_automation.js';
import { getAutomationEventsTool } from '../src/agent/tools/get_automation_events.js';
import type { ToolContext } from '../src/agent/tools/types.js';
import { stubSemanticsPort } from '../src/ports.js';
import { reaffecterProduction, setupActionsWorld, teardownActionsWorld, type ActionsWorld } from './actions-world.js';
import { buildTestApp, loginAs, type TestApp } from './helpers.js';

let t: TestApp;
let w: ActionsWorld;
let ada: string;
let ben: string;

// The demo action refuses over-capacity moves, so the alert is exercised with a variant that doesn't.
const forcer: ActionTypeDef = {
  ...reaffecterProduction,
  apiName: 'ForcerReaffectation',
  displayName: 'Forcer une réaffectation',
  submissionCriteria: [],
};

const alert: AutomationDef = {
  id: 'over-capacity-alert',
  name: 'Over capacity alert',
  description: 'Tell me when a kitchen-day goes over capacity.',
  condition: { kind: 'objectsEnterSet', set: { kind: 'filter', of: { kind: 'all', objectType: 'CuisineJour' }, where: { kind: 'rule', rule: 'surcharge' } } },
  effects: [
    {
      kind: 'notify',
      recipients: [{ kind: 'currentUser' }],
      title: 'Over capacity in {{object.lieu}}',
      body: '{{object.lieu}} is over capacity on {{object.date}} ({{object.charge}} for {{object.capacite}}).',
    },
  ],
};

// Moves lots back to Frepillon when they land in Gennevilliers with 15 units or more.
const bounce: AutomationDef = {
  id: 'bounce-big-lots',
  name: 'Send big lots back',
  description: 'Big lots go back to Frepillon.',
  condition: {
    kind: 'objectsEnterSet',
    set: {
      kind: 'filter',
      of: { kind: 'all', objectType: 'LotProduction' },
      where: {
        kind: 'and',
        filters: [
          { kind: 'cmp', property: 'lieuProduction', op: 'eq', value: 'Gennevilliers' },
          { kind: 'cmp', property: 'quantite', op: 'gte', value: 15 },
        ],
      },
    },
  },
  effects: [
    { kind: 'runAction', action: 'ForcerReaffectation', params: { lot: { kind: 'triggerObject' }, cuisineCible: { kind: 'literal', value: 'Frepillon' } } },
    { kind: 'notify', recipients: [{ kind: 'currentUser' }], title: 'Lot sent back', body: 'Lot {{object.lotId}} went back to Frepillon.' },
  ],
};

async function publishAutomations(defs: AutomationDef[]): Promise<void> {
  const doc: WorkspaceDoc = { ...w.doc, actionTypes: [...w.doc.actionTypes, forcer], automations: defs };
  await sql`UPDATE meta.workspace_versions SET doc = ${JSON.stringify(doc)}::jsonb WHERE project_id = ${w.projectId} AND version = 1`.execute(t.db);
  await sql`DELETE FROM meta.automation_state WHERE project_id = ${w.projectId}`.execute(t.db);
  await sql`DELETE FROM meta.automation_events WHERE project_id = ${w.projectId}`.execute(t.db);
  await sql`DELETE FROM meta.notifications WHERE project_id = ${w.projectId}`.execute(t.db);
}

beforeAll(async () => {
  t = await buildTestApp();
  w = await setupActionsWorld(t.db);
  ada = await loginAs(t.app, 'ada@kumo.test');
  ben = await loginAs(t.app, 'ben@kumo.test');
  await publishAutomations([alert, bounce]);
});
afterAll(async () => {
  await teardownActionsWorld(t.db);
  await t.close();
});

const url = (path: string) => `/api/projects/${w.projectId}${path}`;
const move = (lot: string, to: string, action = 'ForcerReaffectation') =>
  t.app.inject({
    method: 'POST',
    url: url(`/actions/${action}/run`),
    headers: { cookie: ada },
    payload: { params: { lot: { objectType: 'LotProduction', primaryKey: lot }, cuisineCible: to } },
  });
const events = async (id = alert.id) =>
  (await t.app.inject({ method: 'GET', url: url(`/automations/${id}/events`), headers: { cookie: ada } })).json<{ trigger: string; entered: string[]; effects: { status: string }[] }[]>();
const notifications = async (cookie = ada) =>
  (await t.app.inject({ method: 'GET', url: '/api/notifications?unread=1', headers: { cookie } })).json<{ id: string; title: string; body: string; link: string | null; read: boolean }[]>();

describe('AU1 — over-capacity alert', () => {
  it('lists published automations, all off', async () => {
    const res = await t.app.inject({ method: 'GET', url: url('/automations'), headers: { cookie: ada } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject([
      { def: { id: alert.id }, enabled: false, lastEvent: null },
      { def: { id: bounce.id }, enabled: false, lastEvent: null },
    ]);
  });

  it('a viewer cannot switch it on; unknown ids explain themselves', async () => {
    const denied = await t.app.inject({ method: 'POST', url: url(`/automations/${alert.id}/enable`), headers: { cookie: ben } });
    expect(denied.statusCode).toBe(403);
    const unknown = await t.app.inject({ method: 'POST', url: url('/automations/nope/enable'), headers: { cookie: ada } });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toMatchObject({ code: 'NOT_FOUND', hint: expect.stringContaining(alert.id) });
  });

  it('enabling fires nothing', async () => {
    const res = await t.app.inject({ method: 'POST', url: url(`/automations/${alert.id}/enable`), headers: { cookie: ada } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ automationId: alert.id, enabled: true });
    expect(await events()).toEqual([]);
    expect(await notifications()).toEqual([]);
  });

  it('a move that stays within capacity fires nothing', async () => {
    expect((await move('LOT-1', 'Gennevilliers')).statusCode).toBe(200); // 10 + 6 = 16 of 20
    expect(await events()).toEqual([]);
  });

  it('a move that goes over capacity fires once: one event, one notification', async () => {
    const res = await move('LOT-2', 'Gennevilliers'); // 16 + 15 = 31 of 20
    expect(res.statusCode).toBe(200);
    const ev = await events();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ trigger: 'action_run', entered: ['Gennevilliers|2025-10-14'], effects: [{ kind: 'notify', status: 'done' }] });
    const n = await notifications();
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({
      title: 'Over capacity in Gennevilliers',
      body: 'Gennevilliers is over capacity on 2025-10-14 (31 for 20).',
      link: `/p/${w.projectId}/objects/CuisineJour/Gennevilliers|2025-10-14`,
    });
  });

  it('moving more into it does not fire again', async () => {
    expect((await move('LOT-3', 'Frepillon')).statusCode).toBe(200); // Gennevilliers 10-14 now 21 of 20: still over
    expect((await move('LOT-3', 'Gennevilliers')).statusCode).toBe(200); // 31 of 20: still over
    expect(await events()).toHaveLength(1);
    expect(await notifications()).toHaveLength(1);
  });

  it('notifications can be read once', async () => {
    const [first] = await notifications();
    const res = await t.app.inject({ method: 'POST', url: `/api/notifications/${first!.id}/read`, headers: { cookie: ada } });
    expect(res.json()).toEqual({ id: first!.id, read: true });
    expect((await notifications()).map((n) => n.id)).not.toContain(first!.id);
    const other = await t.app.inject({ method: 'POST', url: `/api/notifications/${first!.id}/read`, headers: { cookie: ben } });
    expect(other.statusCode).toBe(404);
    expect(await notifications(ben)).toEqual([]);
  });

  it('disabled automations do not fire; re-enabling does not fire for what is already in the set', async () => {
    await t.app.inject({ method: 'POST', url: url(`/automations/${alert.id}/disable`), headers: { cookie: ada } });
    const before = (await events()).length;
    await move('LOT-4', 'Gennevilliers'); // Gennevilliers 10-15 has no capacity row: nothing enters anyway
    await t.ctx.services.automations.evaluate(w.projectId, 'publish');
    expect(await events()).toHaveLength(before);
    await t.app.inject({ method: 'POST', url: url(`/automations/${alert.id}/enable`), headers: { cookie: ada } });
    await t.ctx.services.automations.evaluate(w.projectId, 'publish');
    expect(await events()).toHaveLength(before);
  });
});

describe('automation that runs an action', () => {
  it('runs the action as the user who enabled it, logs via automation, and does not loop', async () => {
    await publishAutomations([alert, bounce]);
    await move('LOT-2', 'Frepillon');
    await t.app.inject({ method: 'POST', url: url(`/automations/${bounce.id}/enable`), headers: { cookie: ada } });
    await move('LOT-2', 'Gennevilliers'); // 15 units land in Gennevilliers: the automation sends it back
    const lot = await sql<{ lieu_production: string }>`SELECT lieu_production FROM ont.lot_production WHERE lot_id = 'LOT-2'`.execute(t.db);
    expect(lot.rows[0]!.lieu_production).toBe('Frepillon');
    const ev = await events(bounce.id);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ entered: ['LOT-2'], effects: [{ status: 'done' }, { status: 'done' }] });
    const runs = await t.db.selectFrom('meta.action_runs').select(['via', 'run_by']).where('project_id', '=', w.projectId).where('status', '=', 'applied').orderBy('created_at').execute();
    expect(runs.map((r) => r.via).slice(-2)).toEqual(['ui', 'automation']);
    expect(runs[runs.length - 1]!.run_by).toBe(w.ownerId);
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

  it('enable_automation is gated, summarizes for the card, and switches the alert on', async () => {
    await publishAutomations([alert]);
    expect(enableAutomationTool.risk).toBe('gated');
    const input = enableAutomationTool.input.parse({ rationale, automationId: alert.id });
    expect(await enableAutomationTool.summarize!(input, ctx())).toBe("Switch on the alert 'Over capacity alert'");
    const res = await enableAutomationTool.run(input, ctx());
    expect(res).toMatchObject({ ok: true, result: { enabled: true } });
    const bad = await enableAutomationTool.run({ ...input, automationId: 'missing' }, ctx());
    expect(bad).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('disable_automation is gated and switches the alert off', async () => {
    expect(disableAutomationTool.risk).toBe('gated');
    const input = disableAutomationTool.input.parse({ rationale, automationId: alert.id });
    expect(await disableAutomationTool.summarize!(input, ctx())).toBe("Switch off the alert 'Over capacity alert'");
    expect(await disableAutomationTool.run(input, ctx())).toMatchObject({ ok: true, result: { enabled: false } });
    const list = await t.ctx.services.automations.list(w.projectId);
    expect(list[0]!.enabled).toBe(false);
  });

  it('get_automation_events returns recent firings', async () => {
    const input = getAutomationEventsTool.input.parse({ rationale, automationId: alert.id });
    expect(await getAutomationEventsTool.run(input, ctx())).toMatchObject({ ok: true, summary: 'It has not fired yet.', result: [] });
    await sql`INSERT INTO meta.automation_events (project_id, automation_id, trigger, entered, effects)
              VALUES (${w.projectId}, ${alert.id}, 'publish', ${['K1']}::text[], '[]'::jsonb)`.execute(t.db);
    const res = await getAutomationEventsTool.run(input, ctx());
    expect(res).toMatchObject({ ok: true, result: [{ automationId: alert.id, trigger: 'publish', entered: ['K1'] }] });
    expect(getAutomationEventsTool.modes).toEqual(['explore', 'build']);
  });
});
