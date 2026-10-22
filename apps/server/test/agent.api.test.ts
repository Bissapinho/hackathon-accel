import type { AgentEvent } from '@mini/shared';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockGateway, type BetaMessage } from '../src/modules/llm/index.js';
import { answer, fakePort, fakeTools, fixedFacts, msg, use, why } from './agent.helpers.js';
import { buildTestApp, loginAs, type TestApp } from './helpers.js';

// Agent routes of 04-api §1 through HTTP (registered by register.alfred.ts), with the mock gateway.

let t: TestApp;
let projectId: string;
let ada: string;
let ben: string;
const port = fakePort('v1');

beforeAll(async () => {
  t = await buildTestApp({ semantics: port });
  projectId = (await t.db.selectFrom('meta.projects').select('id').where('name', '=', 'Kumo 2025').executeTakeFirstOrThrow()).id;
  ada = await loginAs(t.app, 'ada@kumo.test');
  ben = await loginAs(t.app, 'ben@kumo.test');
});

afterAll(async () => {
  await t.close();
});

function script(messages: BetaMessage[]) {
  const mock = MockGateway.fromMessages(messages);
  const tools = fakeTools();
  t.ctx.services.agent.attach({ services: t.ctx.services, tools: tools.registry, semantics: port, llm: mock, facts: fixedFacts });
  return { mock, tools };
}

const req = (method: 'GET' | 'POST', url: string, cookie?: string, payload?: object) =>
  t.app.inject({ method, url, ...(payload ? { payload } : {}), headers: cookie ? { cookie } : {} });

async function newSession(cookie = ada): Promise<string> {
  const res = await req('POST', `/api/projects/${projectId}/agent/sessions`, cookie, {});
  expect(res.statusCode).toBe(201);
  return res.json().id;
}

async function settle(sid: string) {
  await t.ctx.services.agent.settled(sid);
  return (await req('GET', `/api/agent/sessions/${sid}`, ada)).json();
}

describe('sessions', () => {
  it('creates a session and reads it back with its items', async () => {
    const res = await req('POST', `/api/projects/${projectId}/agent/sessions`, ada, {});
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ projectId, mode: 'router', status: 'idle', waitingFor: null, tokenEstimate: 0, title: 'New conversation' });
    const got = await req('GET', `/api/agent/sessions/${res.json().id}`, ada);
    expect(got.statusCode).toBe(200);
    expect(got.json()).toMatchObject({ session: { id: res.json().id }, items: [] });
  });

  it('401 without login, 404 for an unknown session', async () => {
    expect((await req('POST', `/api/projects/${projectId}/agent/sessions`, undefined, {})).statusCode).toBe(401);
    const res = await req('GET', `/api/agent/sessions/${randomUUID()}`, ada);
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
  });

  it('a viewer reads but gets FORBIDDEN on every write', async () => {
    script([]);
    const sid = await newSession();
    expect((await req('GET', `/api/agent/sessions/${sid}`, ben)).statusCode).toBe(200);
    const writes = [
      req('POST', `/api/projects/${projectId}/agent/sessions`, ben, {}),
      req('POST', `/api/agent/sessions/${sid}/messages`, ben, { text: 'Bonjour' }),
      req('POST', `/api/agent/sessions/${sid}/approvals/${randomUUID()}`, ben, { decision: 'allow' }),
      req('POST', `/api/agent/sessions/${sid}/answers/${randomUUID()}`, ben, { answers: { a: 'b' } }),
      req('POST', `/api/agent/sessions/${sid}/stop`, ben),
    ];
    for (const res of await Promise.all(writes)) {
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('FORBIDDEN');
    }
  });
});

describe('messages, approvals, answers, stop', () => {
  it('POST messages → 202, the loop runs in the background', async () => {
    const { mock } = script([answer('Bonjour, que voulez-vous faire ?')]);
    const sid = await newSession();
    const res = await req('POST', `/api/agent/sessions/${sid}/messages`, ada, { text: 'Bonjour' });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ id: sid, status: 'running', title: 'Bonjour' });
    const body = await settle(sid);
    expect(body.session.status).toBe('idle');
    expect(body.items.map((i: { kind: string }) => i.kind)).toEqual(['user_message', 'assistant_message']);
    expect(mock.requests).toHaveLength(1);
    expect((await req('POST', `/api/agent/sessions/${sid}/messages`, ada, { text: '' })).statusCode).toBe(400);
  });

  it('approval: 409 on a message while paused, allow → 202 and the call runs, a second decision → 409', async () => {
    const { tools } = script([msg([use('publish_draft', { message: 'v1', rationale: why('Publier') })]), answer('Publié.')]);
    const sid = await newSession();
    await t.ctx.services.agent.store.updateSession(sid, { mode: 'build' });
    await req('POST', `/api/agent/sessions/${sid}/messages`, ada, { text: 'Publie' });
    let body = await settle(sid);
    expect(body.session).toMatchObject({ status: 'awaiting_approval', waitingFor: { kind: 'approval' } });
    const aid = body.session.waitingFor.approvalId;
    expect(body.items.find((i: { kind: string }) => i.kind === 'approval_request')).toMatchObject({ approvalId: aid, summary: 'Approve publish_draft' });

    const busy = await req('POST', `/api/agent/sessions/${sid}/messages`, ada, { text: 'Alors ?' });
    expect(busy.statusCode).toBe(409);
    expect(busy.json().code).toBe('SESSION_BUSY');

    expect((await req('POST', `/api/agent/sessions/${sid}/approvals/${aid}`, ada, { decision: 'maybe' })).statusCode).toBe(400);
    const res = await req('POST', `/api/agent/sessions/${sid}/approvals/${aid}`, ada, { decision: 'allow' });
    expect(res.statusCode).toBe(202);
    body = await settle(sid);
    expect(tools.calls.publish_draft).toHaveLength(1);
    expect(body.session.status).toBe('idle');
    expect(body.items.find((i: { kind: string }) => i.kind === 'approval_decision')).toMatchObject({ decision: 'allowed' });
    expect((await req('POST', `/api/agent/sessions/${sid}/approvals/${aid}`, ada, { decision: 'reject' })).statusCode).toBe(409);
    expect((await req('POST', `/api/agent/sessions/${sid}/approvals/${randomUUID()}`, ada, { decision: 'reject' })).statusCode).toBe(404);
  });

  it('approval: reject → REJECTED_BY_USER and the loop continues', async () => {
    const { tools, mock } = script([msg([use('run_action', { actionType: 'Move', rationale: why('Déplacer') })]), answer('D’accord.')]);
    const sid = await newSession();
    await t.ctx.services.agent.store.updateSession(sid, { mode: 'explore' });
    await req('POST', `/api/agent/sessions/${sid}/messages`, ada, { text: 'Déplace' });
    const aid = (await settle(sid)).session.waitingFor.approvalId;
    const res = await req('POST', `/api/agent/sessions/${sid}/approvals/${aid}`, ada, { decision: 'reject', note: 'Pas maintenant' });
    expect(res.statusCode).toBe(202);
    const body = await settle(sid);
    expect(tools.calls.run_action).toBeUndefined();
    expect(body.items.find((i: { kind: string }) => i.kind === 'tool_results').results[0]).toMatchObject({
      tool: 'run_action', ok: false, details: { code: 'REJECTED_BY_USER' },
    });
    expect(JSON.stringify(mock.requests[1]!.messages)).toContain('REJECTED_BY_USER');
  });

  it('answers: 202 and the answers are the tool result', async () => {
    const questions = [{ id: 'base', text: 'Taux de retour par rapport à ?', choices: ['Commandes', 'Livraisons'], allowFreeText: false }];
    const { mock } = script([msg([use('ask_user', { questions, rationale: why('Choisir la base') })]), answer('Noté.')]);
    const sid = await newSession();
    await req('POST', `/api/agent/sessions/${sid}/messages`, ada, { text: 'Taux de retour' });
    let body = await settle(sid);
    expect(body.session).toMatchObject({ status: 'awaiting_answer', waitingFor: { kind: 'question' } });
    const qid = body.session.waitingFor.questionId;
    const bad = await req('POST', `/api/agent/sessions/${sid}/answers/${qid}`, ada, { answers: { base: 'Autre' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().details[0]).toMatchObject({ path: 'answers.base', code: 'not_a_choice' });
    const res = await req('POST', `/api/agent/sessions/${sid}/answers/${qid}`, ada, { answers: { base: 'Livraisons' } });
    expect(res.statusCode).toBe(202);
    body = await settle(sid);
    expect(body.session.status).toBe('idle');
    expect(JSON.stringify(mock.requests[1]!.messages)).toContain('Livraisons');
    expect((await req('POST', `/api/agent/sessions/${sid}/answers/${qid}`, ada, { answers: { base: 'Commandes' } })).statusCode).toBe(409);
  });

  it('stop → 200 and a paused session goes idle', async () => {
    script([msg([use('publish_draft', { message: 'v1', rationale: why() })])]);
    const sid = await newSession();
    await t.ctx.services.agent.store.updateSession(sid, { mode: 'build' });
    await req('POST', `/api/agent/sessions/${sid}/messages`, ada, { text: 'Publie' });
    await settle(sid);
    const res = await req('POST', `/api/agent/sessions/${sid}/stop`, ada);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'idle', waitingFor: null });
  });
});

describe('SSE events', () => {
  it('streams the status, then items with their rationale, then the final status', async () => {
    script([msg([use('list_datasets', { rationale: why('Lister les fichiers') })]), answer('Voilà.')]);
    const sid = await newSession();
    await t.ctx.services.agent.store.updateSession(sid, { mode: 'explore' });
    const address = await t.app.listen({ port: 0, host: '127.0.0.1' });
    const abort = new AbortController();
    try {
      const res = await fetch(`${address}/api/agent/sessions/${sid}/events`, { headers: { cookie: ada }, signal: abort.signal });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      const events: AgentEvent[] = [];
      let buffer = '';
      const readUntil = async (done: () => boolean) => {
        while (!done()) {
          const { value, done: end } = await reader.read();
          if (end) break;
          buffer += decoder.decode(value, { stream: true });
          let cut;
          while ((cut = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, cut);
            buffer = buffer.slice(cut + 2);
            const data = frame.split('\n').find((l) => l.startsWith('data: '));
            if (data) events.push(JSON.parse(data.slice(6)));
          }
        }
      };
      await readUntil(() => events.length > 0);
      expect(events[0]).toEqual({ type: 'status', status: 'idle', mode: 'explore' });

      await req('POST', `/api/agent/sessions/${sid}/messages`, ada, { text: 'Quelles données ?' });
      await readUntil(() => events.some((e) => e.type === 'item' && e.item.kind === 'assistant_message' && e.item.text === 'Voilà.')
        && events.at(-1)?.type === 'status');
      const kinds = events.flatMap((e) => (e.type === 'item' ? [e.item.kind] : []));
      expect(kinds).toEqual(['user_message', 'assistant_message', 'tool_call', 'tool_results', 'assistant_message']);
      expect(events.find((e) => e.type === 'item' && e.item.kind === 'tool_call')).toMatchObject({
        item: { tool: 'list_datasets', title: 'Lister les fichiers', why: why().why },
      });
      expect(events.at(-1)).toEqual({ type: 'status', status: 'idle', mode: 'explore' });
      abort.abort();

      // Reconnecting with ?after= replays the items missed since that seq.
      const again = await fetch(`${address}/api/agent/sessions/${sid}/events?after=0`, { headers: { cookie: ben } });
      const r2 = again.body!.getReader();
      let text = '';
      while (!text.includes('"type":"status"')) text += decoder.decode((await r2.read()).value, { stream: true });
      await r2.cancel();
      expect(text.match(/"type":"item"/g)).toHaveLength(5);
      expect(text).toMatch(/^id: \d+\ndata: /);
    } finally {
      abort.abort();
      await t.ctx.services.agent.settled(sid);
    }
  });
});
