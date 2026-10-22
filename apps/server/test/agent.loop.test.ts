import type { AgentEvent, AgentMode } from '@mini/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RESULT_MAX_CHARS } from '../src/agent/loop.js';
import { AgentService } from '../src/modules/agent/index.js';
import { agentDb } from '../src/modules/agent/tables.js';
import type { ToolResultContent } from '../src/modules/agent/types.js';
import { MockGateway, type BetaMessage, type BetaMessageParam } from '../src/modules/llm/index.js';
import type { User } from '../src/modules/resources/schemas.js';
import { answer, fakePort, fakeTools, fixedFacts, msg, text, thinking, use, why, type FakeTools } from './agent.helpers.js';
import { buildTestApp, type TestApp } from './helpers.js';

// T-22 / T-23 loop checks with the mock gateway: G1–G8, G10, G11 (07-acceptance-tests §2).

let t: TestApp;
let projectId: string;
let ada: User;
const port = fakePort(null);

beforeAll(async () => {
  t = await buildTestApp({ semantics: port });
  projectId = (await t.db.selectFrom('meta.projects').select('id').where('name', '=', 'Kumo 2025').executeTakeFirstOrThrow()).id;
  ada = (await t.ctx.services.resources.getUserByEmail('ada@kumo.test'))!;
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  port.version = null;
});

type Setup = { mock: MockGateway; agent: AgentService; sid: string; tools: FakeTools };

async function setup(script: BetaMessage[], opts: { mode?: AgentMode; tools?: FakeTools; budget?: number; maxSteps?: number } = {}): Promise<Setup> {
  const mock = MockGateway.fromMessages(script);
  const tools = opts.tools ?? fakeTools();
  const agent = opts.budget ? new AgentService({ db: t.db, tokenBudget: opts.budget }) : t.ctx.services.agent;
  agent.attach({
    services: t.ctx.services, tools: tools.registry, semantics: port, llm: mock, facts: fixedFacts,
    ...(opts.maxSteps ? { maxSteps: opts.maxSteps } : {}),
  });
  const s = await agent.createSession(projectId, ada);
  if (opts.mode) await agent.store.updateSession(s.id, { mode: opts.mode });
  return { mock, agent, sid: s.id, tools };
}

async function say(s: Setup, message: string): Promise<void> {
  await s.agent.postMessage(s.sid, ada, message);
  await s.agent.settled(s.sid);
}

/** The tool_result blocks of the last user turn of a request, with their parsed JSON bodies. */
function lastResults(messages: BetaMessageParam[]) {
  const turn = [...messages].reverse().find((m) => m.role === 'user' && Array.isArray(m.content));
  const blocks = (turn?.content ?? []) as ToolResultContent[];
  return blocks.map((b) => {
    const m = /^<item seq="(\d+)" tool="([a-z_]+)" tokens="(\d+)">([\s\S]*)<\/item>$/.exec(b.content);
    if (!m) throw new Error(`not an <item> wrapper: ${b.content.slice(0, 80)}`);
    return { id: b.tool_use_id, isError: b.is_error === true, seq: Number(m[1]), tool: m[2]!, tokens: Number(m[3]), body: JSON.parse(m[4]!) };
  });
}

const session = (s: Setup) => s.agent.store.getSession(s.sid);
const items = (s: Setup) => s.agent.store.listItems(s.sid);
const views = (s: Setup) => s.agent.itemViews(s.sid);

describe('request building (05-agent §6)', () => {
  it('sends the cached system, every tool in a stable order, the user turn, then fresh facts and the mode guide', async () => {
    const s = await setup([answer('Bonjour !')]);
    await say(s, 'Bonjour');
    const req = s.mock.requests[0]!;
    expect(req.system).toContain('Project: Kumo 2025');
    expect(req.system).toContain('User: Ada');
    expect(req.tools.map((x) => x.name)).toEqual([...s.tools.registry.keys()]);
    expect(req.messages.map((m) => m.role)).toEqual(['user', 'system', 'system']);
    expect(req.messages[1]!.content).toContain('## Current facts');
    expect(req.messages[2]!.content).toContain('## Mode: router');
    expect((await session(s)).status).toBe('idle');
    const v = await views(s);
    expect(v.map((i) => i.kind)).toEqual(['user_message', 'assistant_message']);
    expect(v[1]).toMatchObject({ kind: 'assistant_message', text: 'Bonjour !' });
  });

  it('wraps results in <item seq tool tokens> and cuts them at 6000 characters with truncated + hint', async () => {
    const tools = fakeTools({ get_workspace: async () => ({ ok: true, summary: 'big', result: 'x'.repeat(10_000) }) });
    const s = await setup([msg([use('get_workspace', { rationale: why() })]), answer()], { mode: 'explore', tools });
    await say(s, 'Show me everything');
    const [r] = lastResults(s.mock.requests[1]!.messages);
    const callItem = (await items(s)).find((i) => i.kind === 'tool_call')!;
    expect(r).toMatchObject({ tool: 'get_workspace', seq: callItem.seq, isError: false });
    expect(r!.body).toMatchObject({ ok: true, summary: 'big', truncated: true, hint: expect.stringContaining('narrow') });
    expect(r!.body.partial).toHaveLength(RESULT_MAX_CHARS);
  });
});

describe('G1 BAD_ARGUMENTS', () => {
  it('returns BAD_ARGUMENTS as an is_error result and the session continues', async () => {
    const s = await setup([msg([use('list_datasets', { limit: 3 })]), answer('Ok')], { mode: 'explore' });
    await say(s, 'Quelles données ?');
    const [r] = lastResults(s.mock.requests[1]!.messages);
    expect(r).toMatchObject({ isError: true, tool: 'list_datasets', body: { ok: false, code: 'BAD_ARGUMENTS' } });
    expect(r!.body.message).toContain('rationale');
    expect(s.tools.calls.list_datasets).toBeUndefined();
    expect((await session(s)).status).toBe('idle');
  });

  it('a tool input cut off at max_tokens is BAD_ARGUMENTS too, with a note, and the loop continues', async () => {
    const s = await setup([msg([use('list_datasets', { rationale: why() })], 'max_tokens'), answer('Ok')], { mode: 'explore' });
    await say(s, 'Quelles données ?');
    const req = s.mock.requests[1]!;
    const [r] = lastResults(req.messages);
    expect(r).toMatchObject({ isError: true, body: { code: 'BAD_ARGUMENTS' } });
    expect(req.messages.at(-1)).toMatchObject({ role: 'system', content: expect.stringContaining('cut off') });
    expect(s.tools.calls.list_datasets).toBeUndefined();
    expect((await views(s)).some((v) => v.kind === 'note' && v.text.includes('cut off'))).toBe(true);
    expect((await session(s)).status).toBe('idle');
  });
});

describe('G2 modes and the build lock', () => {
  it('refuses a tool outside its modes with UNKNOWN_TOOL_FOR_MODE and the change_mode hint', async () => {
    const s = await setup([msg([use('list_datasets', { rationale: why() })]), answer()]);
    await say(s, 'Liste les données');
    const [r] = lastResults(s.mock.requests[1]!.messages);
    expect(r).toMatchObject({ isError: true, body: { ok: false, code: 'UNKNOWN_TOOL_FOR_MODE', hint: expect.stringContaining('change_mode') } });
  });

  it('refuses build without a semantic version (NO_SEMANTIC_VERSION), allows it once one is published', async () => {
    const s = await setup([
      msg([use('change_mode', { mode: 'build', reason: 'Build objects', rationale: why('Passer en construction') })]),
      answer('Il faut d’abord publier le sens.'),
    ]);
    await say(s, 'Construis les objets');
    const [r] = lastResults(s.mock.requests[1]!.messages);
    expect(r).toMatchObject({ isError: true, body: { code: 'NO_SEMANTIC_VERSION' } });
    expect((await session(s)).mode).toBe('router');

    port.version = 'v1';
    const s2 = await setup([msg([use('change_mode', { mode: 'build', reason: 'Build objects', rationale: why() })]), answer()]);
    await say(s2, 'Construis les objets');
    expect((await session(s2)).mode).toBe('build');
  });

  it('a mode change appends a mode_change item and the new guide as a system message, tools unchanged', async () => {
    const s = await setup([
      msg([use('change_mode', { mode: 'semantics', reason: 'New project', rationale: why('Passer au sens') })]),
      answer(),
    ]);
    await say(s, 'Aide-moi');
    expect((await session(s)).mode).toBe('semantics');
    expect((await views(s)).find((v) => v.kind === 'mode_change')).toMatchObject({ from: 'router', to: 'semantics' });
    const [first, second] = s.mock.requests;
    expect(second!.messages.at(-1)).toMatchObject({ role: 'system', content: expect.stringContaining('semantics') });
    expect(JSON.stringify(second!.tools)).toBe(JSON.stringify(first!.tools));
    expect(second!.system).toBe(first!.system);
  });
});

describe('G3 approvals', () => {
  const script = () => [
    msg([use('publish_semantics', { summary: 'v1', rationale: why('Publier le sens') }), use('edit_semantics', { ops: [], rationale: why('Noter') })]),
    answer('Fini.'),
  ];

  it('pauses on publish_semantics; Reject returns REJECTED_BY_USER and later calls run after the decision, all in one user turn', async () => {
    const s = await setup(script(), { mode: 'semantics' });
    await say(s, 'Publie');
    const paused = await session(s);
    expect(paused.status).toBe('awaiting_approval');
    expect(s.tools.calls.edit_semantics).toBeUndefined();
    expect(s.mock.requests).toHaveLength(1);
    const card = (await views(s)).find((v) => v.kind === 'approval_request');
    expect(card).toMatchObject({ tool: 'publish_semantics', summary: 'Approve publish_semantics' });
    const approvalId = (card as { approvalId: string }).approvalId;
    expect(paused.pending?.approvalId).toBe(approvalId);

    await s.agent.decide(s.sid, approvalId, ada, { decision: 'reject', note: 'Pas encore' });
    await s.agent.settled(s.sid);
    expect(s.tools.calls.publish_semantics).toBeUndefined();
    expect(s.tools.calls.edit_semantics).toHaveLength(1);
    const results = lastResults(s.mock.requests[1]!.messages);
    expect(results.map((r) => [r.tool, r.isError, r.body.code ?? 'ok'])).toEqual([
      ['publish_semantics', true, 'REJECTED_BY_USER'],
      ['edit_semantics', false, 'ok'],
    ]);
    expect(results[0]!.body.message).toContain('Pas encore');
    expect((await session(s)).status).toBe('idle');
    const row = await agentDb(t.db).selectFrom('meta.approvals').selectAll().where('id', '=', approvalId).executeTakeFirstOrThrow();
    expect(row).toMatchObject({ status: 'rejected', decided_by: ada.id, note: 'Pas encore' });
    expect((await views(s)).find((v) => v.kind === 'approval_decision')).toMatchObject({ decision: 'rejected', note: 'Pas encore' });
  });

  it('Allow runs the call (with edited arguments) then the rest of the response', async () => {
    const s = await setup(script(), { mode: 'semantics' });
    await say(s, 'Publie');
    const { pending } = await session(s);
    await s.agent.decide(s.sid, pending!.approvalId!, ada, { decision: 'allow', editedArgs: { summary: 'Première version' } });
    await s.agent.settled(s.sid);
    expect(s.tools.calls.publish_semantics).toEqual([{ summary: 'Première version', rationale: why('Publier le sens') }]);
    const results = lastResults(s.mock.requests[1]!.messages);
    expect(results.map((r) => [r.tool, r.isError])).toEqual([['publish_semantics', false], ['edit_semantics', false]]);
    expect((await session(s)).status).toBe('idle');
  });

  it('publish_draft pauses too, and a second gated call in the same response pauses again after the first decision', async () => {
    port.version = 'v1';
    const s = await setup([
      msg([use('publish_draft', { message: 'v1', rationale: why() }), use('run_action', { actionType: 'Move', rationale: why() })]),
      answer(),
    ], { mode: 'build' });
    await say(s, 'Publie et applique');
    let state = await session(s);
    expect(state.status).toBe('awaiting_approval');
    await s.agent.decide(s.sid, state.pending!.approvalId!, ada, { decision: 'allow' });
    await s.agent.settled(s.sid);
    state = await session(s);
    expect(state.status).toBe('awaiting_approval');
    expect(s.tools.calls.publish_draft).toHaveLength(1);
    expect(s.mock.requests).toHaveLength(1);
    await s.agent.decide(s.sid, state.pending!.approvalId!, ada, { decision: 'allow' });
    await s.agent.settled(s.sid);
    expect(s.tools.calls.run_action).toHaveLength(1);
    expect(lastResults(s.mock.requests[1]!.messages).map((r) => r.tool)).toEqual(['publish_draft', 'run_action']);
  });

  it('refuses a second decision on the same approval and a message while paused', async () => {
    const s = await setup(script(), { mode: 'semantics' });
    await say(s, 'Publie');
    const { pending } = await session(s);
    await expect(s.agent.postMessage(s.sid, ada, 'Et alors ?')).rejects.toMatchObject({ status: 409, code: 'SESSION_BUSY' });
    await s.agent.decide(s.sid, pending!.approvalId!, ada, { decision: 'allow' });
    await s.agent.settled(s.sid);
    await expect(s.agent.decide(s.sid, pending!.approvalId!, ada, { decision: 'allow' })).rejects.toMatchObject({ status: 409 });
  });
});

describe('G4 questions', () => {
  it('ask_user with multiple: true pauses with awaiting_answer; several choices come back as the tool result', async () => {
    const questions = [{ id: 'seed', text: 'Quelles questions ?', choices: ['Taux de retour', 'Charge cuisine', 'Clients'], multiple: true }];
    const s = await setup([msg([use('ask_user', { questions, rationale: why('Choisir les questions') })]), answer('Merci')], { mode: 'semantics' });
    await say(s, 'Mon objectif: réduire les retours');
    const paused = await session(s);
    expect(paused.status).toBe('awaiting_answer');
    const q = (await views(s)).find((v) => v.kind === 'question');
    expect(q).toMatchObject({ questions: [{ id: 'seed', multiple: true, allowFreeText: true }] });
    const qid = (q as { questionId: string }).questionId;

    await expect(s.agent.answer(s.sid, qid, ada, { other: 'x' })).rejects.toMatchObject({ status: 400 });
    await s.agent.answer(s.sid, qid, ada, { seed: ['Taux de retour', 'Clients'] });
    await s.agent.settled(s.sid);
    const [r] = lastResults(s.mock.requests[1]!.messages);
    expect(r).toMatchObject({ tool: 'ask_user', isError: false });
    expect(r!.body.result).toEqual({ answers: [{ id: 'seed', question: 'Quelles questions ?', answer: ['Taux de retour', 'Clients'] }] });
    expect((await views(s)).find((v) => v.kind === 'answer')).toMatchObject({ questionId: qid, answers: { seed: ['Taux de retour', 'Clients'] } });
    expect((await session(s)).status).toBe('idle');
  });
});

describe('G5 approval policy', () => {
  it('draft and bank-draft tools never create approvals; run_action always does', async () => {
    port.version = 'v1';
    const s = await setup([
      msg([
        use('edit_draft', { ops: [], rationale: why() }),
        use('preview_pipeline', { pipeline: 'commandes', rationale: why() }),
        use('test_logic', { objectType: 'Client', rationale: why() }),
        use('test_action', { actionType: 'Move', rationale: why() }),
      ]),
      msg([use('run_action', { actionType: 'Move', rationale: why() })]),
      answer(),
    ], { mode: 'build' });
    await say(s, 'Teste tout');
    expect((await session(s)).status).toBe('awaiting_approval');
    const approvals = await agentDb(t.db).selectFrom('meta.approvals').select('tool_name').where('session_id', '=', s.sid).execute();
    expect(approvals.map((a) => a.tool_name)).toEqual(['run_action']);
    for (const name of ['edit_draft', 'preview_pipeline', 'test_logic', 'test_action']) expect(s.tools.calls[name]).toHaveLength(1);

    const s2 = await setup([msg([use('edit_semantics', { ops: [], rationale: why() })]), answer()], { mode: 'semantics' });
    await say(s2, 'Note ça');
    expect(await agentDb(t.db).selectFrom('meta.approvals').select('id').where('session_id', '=', s2.sid).execute()).toEqual([]);
  });
});

describe('G6 repeated failures', () => {
  it('stops after three identical failing calls with a note', async () => {
    const tools = fakeTools({ run_sql: async () => ({ ok: false, code: 'SQL_REJECTED', message: 'Only SELECT is allowed.' }) });
    const bad = () => msg([use('run_sql', { sql: 'DELETE FROM x', rationale: why('Nettoyer') })]);
    const s = await setup([bad(), bad(), bad(), answer('never')], { mode: 'explore', tools });
    await say(s, 'Supprime');
    expect(tools.calls.run_sql).toHaveLength(3);
    expect(s.mock.remaining).toBe(1);
    const last = (await views(s)).at(-1);
    expect(last).toMatchObject({ kind: 'note', text: expect.stringContaining('3 times') });
    expect((await session(s)).status).toBe('idle');
  });
});

describe('G7 append-only replay and context editing', () => {
  it('replays assistant content byte-for-byte (thinking included) and never rewrites items', async () => {
    const first = msg([thinking('Je dois lister les données.', 'sig-1'), text('Je regarde.'), use('list_datasets', { rationale: why() })]);
    const s = await setup([first, answer('Voilà.'), answer('Encore.')], { mode: 'explore' });
    await say(s, 'Quelles données ?');
    const before = await items(s);

    const replayed = s.mock.requests[1]!.messages.find((m) => m.role === 'assistant')!;
    expect(JSON.stringify(replayed.content)).toBe(JSON.stringify(first.content));

    await say(s, 'Et ensuite ?');
    const after = await items(s);
    expect(after.slice(0, before.length)).toEqual(before);
    // Every earlier message of the 2nd request is a prefix of the 3rd one.
    const [, second, third] = s.mock.requests;
    expect(JSON.stringify(third!.messages.slice(0, second!.messages.length + 1)))
      .toBe(JSON.stringify([...second!.messages, third!.messages[second!.messages.length]]));
    expect(JSON.stringify(third!.messages).includes('"signature":"sig-1"')).toBe(true);
  });

  it('asks for context editing once the token estimate passes the budget', async () => {
    const s = await setup([answer('x'.repeat(8000)), answer('Deux')], { budget: 1000 });
    await say(s, 'Bonjour');
    expect(s.mock.requests[0]!.contextEditing).toBeUndefined();
    expect(s.mock.sent[0]!.context_management).toBeUndefined();
    expect((await session(s)).tokenEstimate).toBeGreaterThan(1000);
    await say(s, 'Encore');
    expect(s.mock.requests[1]!.contextEditing).toBe(true);
    expect(s.mock.sent[1]!.context_management).toEqual({ edits: [{ type: 'clear_tool_uses_20250919' }] });
  });
});

describe('G8 rationale', () => {
  it('every tool_call item and its SSE event carry the rationale title and why', async () => {
    const s = await setup([msg([use('list_datasets', { rationale: why('Lister les fichiers') })]), answer()], { mode: 'explore' });
    const events: AgentEvent[] = [];
    const off = s.agent.hub.subscribe(s.sid, (e) => events.push(e));
    await say(s, 'Quelles données ?');
    off();
    const call = (await views(s)).find((v) => v.kind === 'tool_call');
    expect(call).toMatchObject({ tool: 'list_datasets', title: 'Lister les fichiers', why: why().why, risk: 'read' });
    const evt = events.find((e) => e.type === 'item' && e.item.kind === 'tool_call');
    expect(evt).toMatchObject({ item: { title: 'Lister les fichiers', why: why().why } });
    expect(events.some((e) => e.type === 'status' && e.status === 'running')).toBe(true);
    expect(events.some((e) => e.type === 'delta')).toBe(true);
    expect(events.some((e) => e.type === 'tokens' && e.budget === s.agent.tokenBudget)).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'status', status: 'idle' });
  });
});

describe('G10 refusals and model errors', () => {
  it('a refusal ends the step with a plain message and runs no tool', async () => {
    const s = await setup([msg([use('list_datasets', { rationale: why() })], 'refusal'), answer('Ok')], { mode: 'explore' });
    await say(s, 'Quelque chose');
    expect(s.tools.calls.list_datasets).toBeUndefined();
    expect(s.mock.requests).toHaveLength(1);
    expect((await session(s)).status).toBe('idle');
    expect((await views(s)).at(-1)).toMatchObject({ kind: 'note', text: expect.stringContaining("can't help") });
    // The refused tool_use got an error result, so the next request is valid.
    await say(s, 'Autre chose');
    const msgs = s.mock.requests[1]!.messages;
    const resultsTurn = msgs.find((m) => m.role === 'user' && Array.isArray(m.content));
    expect(resultsTurn).toBeDefined();
    expect(lastResults(msgs.slice(0, msgs.indexOf(resultsTurn!) + 1))[0]).toMatchObject({ isError: true, body: { code: 'NOT_RUN' } });
  });

  it('a model error ends the step with a plain message', async () => {
    const mock = new MockGateway([{ error: { code: 'LLM_BAD_REQUEST', message: 'Claude rejected the request.', status: 400 } }]);
    const tools = fakeTools();
    const agent = t.ctx.services.agent;
    agent.attach({ services: t.ctx.services, tools: tools.registry, semantics: port, llm: mock, facts: fixedFacts });
    const sid = (await agent.createSession(projectId, ada)).id;
    await agent.postMessage(sid, ada, 'Bonjour');
    await agent.settled(sid);
    expect((await agent.store.getSession(sid)).status).toBe('idle');
    expect((await agent.itemViews(sid)).at(-1)).toMatchObject({ kind: 'note', text: expect.stringContaining('Claude rejected the request.') });
  });
});

describe('G11 trajectories', () => {
  it('an explore answer writes a trajectory with the semantic version and the browse / resolve calls', async () => {
    port.version = 'v1';
    const tools = fakeTools({
      resolve_semantics: async () => ({ ok: true, summary: 'resolved', result: { mentions: [{ mention: 'taux de retour', mappings: [] }] } }),
    });
    const s = await setup([
      msg([use('browse_semantics', { query: 'retours', rationale: why() }), use('resolve_semantics', { mentions: ['taux de retour'], rationale: why() })]),
      msg([use('run_sql', { sql: 'SELECT 1', rationale: why() })]),
      answer('Le taux de retour est de 12 %.'),
    ], { mode: 'explore', tools });
    await say(s, 'Quel est le taux de retour ?');
    const rows = await t.ctx.services.semantics.listTrajectories(projectId, { limit: 50 });
    const tr = rows.find((r) => r.sessionId === s.sid);
    expect(tr).toMatchObject({
      question: 'Quel est le taux de retour ?', semVersion: 'v1', status: 'answered', answer: 'Le taux de retour est de 12 %.',
    });
    expect(tr!.semanticCalls.map((c) => c.tool)).toEqual(['browse_semantics', 'resolve_semantics']);
    expect(tr!.semanticCalls[1]).toMatchObject({ input: { mentions: ['taux de retour'] }, result: { mentions: [{ mention: 'taux de retour' }] } });
    expect(tr!.toolCalls.map((c) => c.tool)).toEqual(['run_sql']);
  });

  it('writes no trajectory outside explore mode', async () => {
    const s = await setup([answer('Bonjour')], { mode: 'semantics' });
    await say(s, 'Bonjour');
    const rows = await t.ctx.services.semantics.listTrajectories(projectId, { limit: 500 });
    expect(rows.some((r) => r.sessionId === s.sid)).toBe(false);
  });
});

describe('limits and stop', () => {
  it('skips calls beyond 6 in one response with TOO_MANY_TOOL_CALLS', async () => {
    const calls = Array.from({ length: 7 }, () => use('list_datasets', { rationale: why() }));
    const s = await setup([msg(calls), answer()], { mode: 'explore' });
    await say(s, 'Tout');
    const results = lastResults(s.mock.requests[1]!.messages);
    expect(results).toHaveLength(7);
    expect(results[6]).toMatchObject({ isError: true, body: { code: 'TOO_MANY_TOOL_CALLS' } });
    expect(s.tools.calls.list_datasets).toHaveLength(6);
  });

  it('stops after the current step when asked', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const tools = fakeTools({ list_datasets: async () => { await gate; return { ok: true, summary: 'ok', result: [] }; } });
    const s = await setup([msg([use('list_datasets', { rationale: why() })]), answer('never')], { mode: 'explore', tools });
    await s.agent.postMessage(s.sid, ada, 'Liste');
    while (!tools.calls.list_datasets) await new Promise((r) => setTimeout(r, 5));
    await s.agent.stop(s.sid);
    release();
    await s.agent.settled(s.sid);
    expect(s.mock.remaining).toBe(1);
    expect((await session(s)).status).toBe('idle');
    expect((await views(s)).at(-1)).toMatchObject({ kind: 'note', text: 'Stopped as you asked.' });
  });

  it('stop while paused closes the pending calls and the next message works', async () => {
    const s = await setup([
      msg([use('publish_semantics', { summary: 'v1', rationale: why() }), use('edit_semantics', { ops: [], rationale: why() })]),
      answer('Ok'),
    ], { mode: 'semantics' });
    await say(s, 'Publie');
    await s.agent.stop(s.sid);
    const state = await session(s);
    expect(state).toMatchObject({ status: 'idle', pending: null });
    await say(s, 'Reprenons');
    const msgs = s.mock.requests[1]!.messages;
    const resultsTurn = msgs.find((m) => m.role === 'user' && Array.isArray(m.content))!;
    expect(lastResults([resultsTurn]).map((r) => r.body.code)).toEqual(['STOPPED_BY_USER', 'NOT_RUN']);
    expect(s.tools.calls.edit_semantics).toBeUndefined();
  });

  it('stops at the step limit with a note', async () => {
    const s = await setup([msg([use('list_datasets', { rationale: why() })]), msg([use('list_datasets', { rationale: why('Encore') })])], { mode: 'explore', maxSteps: 2 });
    await say(s, 'Boucle');
    expect((await views(s)).at(-1)).toMatchObject({ kind: 'note', text: expect.stringContaining('2 steps') });
  });
});
