import Anthropic from '@anthropic-ai/sdk';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { buildToolRegistry } from '../src/agent/registry.js';
import { getObject } from '../src/agent/tools/get_object.js';
import { queryObjects } from '../src/agent/tools/query_objects.js';
import {
  AnthropicGateway, buildLlmServices, buildParams, catalogDescriptions, checkMessageSequence, createLlmGateway, interpretMessage, LlmError, loadLlmConfig,
  MockGateway, parseMockFile, RecordingGateway, toLlmTool, toLlmTools,
  type BetaMessage, type LlmRequest, type LlmTool,
} from '../src/modules/llm/index.js';

const rationale = z.object({ title: z.string().max(60), why: z.string().max(160) });
const rationaleJson = { type: 'object', properties: { title: { type: 'string' }, why: { type: 'string' } }, required: ['title', 'why'] };
const tools: LlmTool[] = [
  {
    name: 'change_mode', description: 'Switch mode',
    inputSchema: { type: 'object', properties: { mode: { type: 'string', enum: ['router', 'explore', 'semantics', 'build'] }, reason: { type: 'string' }, rationale: rationaleJson }, required: ['mode', 'reason', 'rationale'] },
    schema: z.object({ mode: z.enum(['router', 'explore', 'semantics', 'build']), reason: z.string(), rationale }),
  },
  {
    name: 'preview_dataset', description: 'First rows',
    inputSchema: { type: 'object', properties: { datasetId: { type: 'string' }, limit: { type: 'integer' }, rationale: rationaleJson }, required: ['datasetId', 'rationale'] },
    schema: z.object({ datasetId: z.string(), limit: z.number().int().max(50).default(20), rationale }),
  },
];
const why = { title: 'Voir les données', why: 'Comprendre les colonnes' };

function msg(content: unknown[], stop_reason: string, extra: Record<string, unknown> = {}): BetaMessage {
  return {
    id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason, stop_sequence: null,
    usage: { input_tokens: 120, output_tokens: 40, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0 },
    ...extra,
  } as unknown as BetaMessage;
}
const toolUse = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input });
const req = (extra: Partial<LlmRequest> = {}): LlmRequest => ({
  system: 'Tu es l’agent.', tools, messages: [{ role: 'user', content: 'Bonjour' }], ...extra,
});

describe('request body', () => {
  const params = buildParams({ model: 'claude-opus-5-5', effort: 'high' }, req());

  it('uses the Claude specifics of 05-agent §1', () => {
    expect(params).toMatchObject({
      model: 'claude-opus-5-5', max_tokens: 32_000,
      betas: ['server-side-fallback-2026-07-01', 'context-management-2025-06-27'],
      fallbacks: 'default',
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: 'high' },
      tool_choice: { type: 'auto' },
      cache_control: { type: 'ephemeral' },
    });
    expect(params).not.toHaveProperty('temperature');
    expect(params).not.toHaveProperty('context_management');
  });

  it('caches system + tools with one breakpoint and streams tool inputs eagerly', () => {
    expect(params.system).toEqual([{ type: 'text', text: 'Tu es l’agent.', cache_control: { type: 'ephemeral' } }]);
    expect(params.tools).toEqual(tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema, eager_input_streaming: true })));
  });

  it('keeps the prefix identical whatever the conversation, and asks for context editing only when told', () => {
    const later = buildParams({ model: 'claude-opus-5-5', effort: 'high' }, req({
      messages: [{ role: 'user', content: 'Bonjour' }, { role: 'assistant', content: 'Salut' }, { role: 'user', content: 'Et ensuite ?' }, { role: 'system', content: 'Mode: semantics' }],
      contextEditing: true,
    }));
    expect(JSON.stringify([later.tools, later.system])).toBe(JSON.stringify([params.tools, params.system]));
    expect(later.context_management).toEqual({ edits: [{ type: 'clear_tool_uses_20250919' }] });
  });
});

describe('interpretMessage', () => {
  it('validates every tool call with its zod schema (parallel calls kept in order)', () => {
    const turn = interpretMessage(msg([
      { type: 'thinking', thinking: 'Je regarde', signature: 'sig' },
      toolUse('tu_1', 'preview_dataset', { datasetId: 'ds1', rationale: why }),
      toolUse('tu_2', 'change_mode', { mode: 'banana', reason: 'x', rationale: why }),
      toolUse('tu_3', 'drop_everything', {}),
    ], 'tool_use'), tools);
    expect(turn.outcome).toBe('tool_use');
    expect(turn.toolCalls).toEqual([
      { id: 'tu_1', name: 'preview_dataset', ok: true, input: { datasetId: 'ds1', limit: 20, rationale: why } },
      expect.objectContaining({ id: 'tu_2', ok: false, code: 'BAD_ARGUMENTS', issues: [expect.objectContaining({ path: 'mode' })] }),
      expect.objectContaining({ id: 'tu_3', ok: false, code: 'UNKNOWN_TOOL' }),
    ]);
    expect(turn.usage).toEqual({ input: 120, output: 40, cacheRead: 3000, cacheWrite: 0 });
  });

  it('a truncated or incomplete input is BAD_ARGUMENTS, and at max_tokens nothing runs', () => {
    const missing = interpretMessage(msg([toolUse('tu_1', 'preview_dataset', { rationale: why })], 'tool_use'), tools);
    expect(missing.toolCalls[0]).toMatchObject({ ok: false, code: 'BAD_ARGUMENTS' });
    const cut = interpretMessage(msg([toolUse('tu_1', 'preview_dataset', { datasetId: 'ds1', rationale: why })], 'max_tokens'), tools);
    expect(cut.outcome).toBe('max_tokens');
    expect(cut.toolCalls[0]).toMatchObject({ ok: false, code: 'TRUNCATED' });
  });

  it('G10: a refusal returns no tool call and the category', () => {
    const turn = interpretMessage(msg([toolUse('tu_1', 'preview_dataset', { datasetId: 'ds1', rationale: why })], 'refusal', {
      stop_details: { type: 'refusal', category: 'cyber', explanation: 'declined' },
    }), tools);
    expect(turn).toMatchObject({ outcome: 'refusal', toolCalls: [], refusal: { category: 'cyber', explanation: 'declined' } });
  });

  it('reports a server-side fallback and the model that answered', () => {
    const turn = interpretMessage(msg([
      { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-4-8' }, trigger: { type: 'refusal' } },
      { type: 'text', text: 'Voici.' },
    ], 'end_turn', { model: 'claude-opus-4-8' }), tools);
    expect(turn).toMatchObject({ outcome: 'end_turn', fellBack: true, servedBy: 'claude-opus-4-8' });
  });
});

describe('mock gateway', () => {
  const lines = [
    msg([{ type: 'thinking', thinking: 'Je regarde les données', signature: 's' }, { type: 'text', text: 'Je regarde.' }, toolUse('tu_1', 'preview_dataset', { datasetId: 'ds1', rationale: why })], 'tool_use'),
    msg([{ type: 'text', text: 'Fini.' }], 'end_turn'),
  ];

  it('replays recorded responses in order, streams them, records what was asked', async () => {
    const mock = MockGateway.fromMessages(lines);
    const seen: string[] = [];
    const r1 = await mock.stream(req(), {
      onThinking: (d) => seen.push(`thinking:${d}`), onText: (d) => seen.push(`text:${d}`), onToolStart: (c) => seen.push(`tool:${c.name}`),
    });
    expect(seen).toEqual(['thinking:Je regarde les données', 'text:Je regarde.', 'tool:preview_dataset']);
    expect(r1.toolCalls[0]).toMatchObject({ ok: true });

    const history: LlmRequest['messages'] = [
      ...req().messages,
      { role: 'assistant', content: r1.message.content },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'ok' }] },
    ];
    const r2 = await mock.stream(req({ messages: history }));
    expect(r2.outcome).toBe('end_turn');
    // G7-style check: the stored assistant content went back unchanged, thinking block included.
    expect(mock.requests[1]?.messages[1]).toEqual({ role: 'assistant', content: lines[0]?.content });
    expect(mock.sent[1]?.fallbacks).toBe('default');
    expect(mock.remaining).toBe(0);
    await expect(mock.stream(req())).rejects.toMatchObject({ code: 'LLM_MOCK_EXHAUSTED' });
  });

  it('reads JSONL files, including scripted errors, and says which line is wrong', async () => {
    const text = [JSON.stringify({ response: lines[1], note: 'last turn' }), '', JSON.stringify({ error: { code: 'LLM_BAD_REQUEST', message: 'bad', status: 400 } })].join('\n');
    const mock = new MockGateway(parseMockFile(text));
    expect((await mock.stream(req())).outcome).toBe('end_turn');
    await expect(mock.stream(req())).rejects.toMatchObject({ code: 'LLM_BAD_REQUEST', details: { status: 400 } });
    expect(() => parseMockFile('{"response": 1}\nnope', 'demo.jsonl')).toThrow('demo.jsonl, line 2: not valid JSON');
    expect(() => parseMockFile('{"hello": 1}')).toThrow('line 1: expected');
  });

  it('the recording gateway writes a file the mock replays identically', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'llm-')), 'session.jsonl');
    const recorder = new RecordingGateway(MockGateway.fromMessages(lines), file);
    const original = [await recorder.stream(req()), await recorder.stream(req())];
    const replay = MockGateway.fromFile(file);
    expect([await replay.stream(req()), await replay.stream(req())]).toEqual(original);
  });

  it('createLlmGateway picks the mock with LLM_MOCK=1 and checks LLM_EFFORT', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'llm-')), 'demo.jsonl');
    writeFileSync(file, JSON.stringify({ response: lines[1] }) + '\n');
    expect(createLlmGateway({ LLM_MOCK: '1', LLM_MOCK_FILE: file }).kind).toBe('mock');
    expect(createLlmGateway({ LLM_RECORD_FILE: file, ANTHROPIC_API_KEY: 'x' }).kind).toBe('recording');
    expect(() => createLlmGateway({ LLM_EFFORT: 'turbo' })).toThrow('LLM_EFFORT');
    expect(readFileSync(file, 'utf8')).toContain('Fini.');
  });

  it('reads the env like src/config.ts (empty means unset) and starts without a recorded file', async () => {
    expect(loadLlmConfig({ LLM_MODEL: '', LLM_EFFORT: '', LLM_RECORD_FILE: '' })).toEqual({
      LLM_MOCK: '0', LLM_MOCK_FILE: 'fixtures/demo-session.jsonl', LLM_MODEL: 'claude-opus-5-5', LLM_EFFORT: 'high',
    });
    const missing = createLlmGateway({ LLM_MOCK: '1', LLM_MOCK_FILE: '/nonexistent/demo-session.jsonl' });
    expect(missing.kind).toBe('mock');
    await expect(missing.stream(req())).rejects.toMatchObject({ code: 'LLM_MOCK_EXHAUSTED', message: expect.stringContaining('/nonexistent/demo-session.jsonl') });
  });

  it('buildLlmServices returns { llm } from the env (vitest sets LLM_MOCK=1) or the gateway given', () => {
    expect(process.env.LLM_MOCK).toBe('1');
    expect(buildLlmServices().llm.kind).toBe('mock');
    const given = MockGateway.fromMessages([]);
    expect(buildLlmServices({ llm: given }).llm).toBe(given);
  });
});

describe('message order rules (checkMessageSequence)', () => {
  type M = LlmRequest['messages'];
  const U = (content: string): M[number] => ({ role: 'user', content });
  const A = (content: string): M[number] => ({ role: 'assistant', content });
  const S = (content: string): M[number] => ({ role: 'system', content });
  const codes = (m: M) => checkMessageSequence(m).map((i) => `${i.index}:${i.code}`);

  it('accepts system messages after a user turn that end the array or precede an assistant message', () => {
    expect(codes([U('a'), S('facts'), S('mode')])).toEqual([]);
    expect(codes([U('a'), S('facts'), S('mode'), A('b'), U('c'), S('mode 2')])).toEqual([]);
    expect(codes([U('a'), A('b'), U('c'), U('d')])).toEqual([]);
    // Directive-only form (no content) may sit anywhere.
    expect(codes([U('a'), A('b'), { role: 'system', content: [] }, U('c')])).toEqual([]);
  });

  it('flags the live bug: a system message between two user turns (messages.2 of user, system, system, user)', () => {
    const issues = checkMessageSequence([U('Bonjour'), S('facts'), S('mode'), U('Bonjour ?')]);
    expect(issues.map((i) => `${i.index}:${i.code}`)).toEqual(['1:SYSTEM_PLACEMENT', '2:SYSTEM_PLACEMENT']);
    expect(issues[1]!.message).toContain("messages.2: role 'system' must precede an 'assistant' message");
  });

  it('flags a system message first or right after an assistant message, a final assistant message, and tool pairing errors', () => {
    expect(codes([S('x'), U('a')])).toEqual(['0:FIRST_NOT_USER', '0:SYSTEM_PLACEMENT', '0:SYSTEM_PLACEMENT']);
    expect(codes([U('a'), A('b'), S('continue')])).toEqual(['2:SYSTEM_PLACEMENT']);
    expect(codes([U('a'), A('b')])).toEqual(['1:ENDS_WITH_ASSISTANT']);
    const call: M[number] = { role: 'assistant', content: [{ type: 'tool_use', id: 'tu_1', name: 'x', input: {} }] };
    const result = (id: string): M[number] => ({ role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] });
    expect(codes([U('a'), call, result('tu_1'), U('b')])).toEqual([]);
    expect(codes([U('a'), call, U('b')])).toEqual(['1:TOOL_USE_UNANSWERED']);
    expect(codes([U('a'), call, result('tu_2')])).toEqual(['2:TOOL_RESULT_UNKNOWN', '1:TOOL_USE_UNANSWERED']);
    expect(codes([U('a'), call, U('b'), result('tu_1')])).toEqual(['2:TOOL_RESULT_ORDER']);
  });

  it('the mock gateway answers an invalid order with a 400, like the API', async () => {
    const mock = MockGateway.fromMessages([msg([{ type: 'text', text: 'Ok' }], 'end_turn')]);
    await expect(mock.stream(req({ messages: [U('a'), S('b'), U('c')] }))).rejects.toMatchObject({
      code: 'LLM_BAD_REQUEST', details: { status: 400 }, message: expect.stringContaining("role 'system' must precede"),
    });
    expect(mock.remaining).toBe(1);
  });
});

describe('tool specs from agent tool definitions', () => {
  it('builds name, catalog description, generated JSON schema and the zod schema', () => {
    const tool = toLlmTool(queryObjects);
    expect(tool.name).toBe('query_objects');
    expect(tool.description).toBe(catalogDescriptions().get('query_objects'));
    expect(tool.description.length).toBeGreaterThan(20);
    expect(tool.schema).toBe(queryObjects.input);
    expect(tool.inputSchema).not.toHaveProperty('$schema');
    expect(tool.inputSchema).toMatchObject({
      type: 'object',
      properties: { set: expect.any(Object), pageSize: { type: 'integer', maximum: 50 }, rationale: { type: 'object', required: ['title', 'why'] } },
    });
    expect(tool.inputSchema.required).toEqual(expect.arrayContaining(['set', 'rationale']));
    // Recursive filters keep $refs that resolve inside the schema itself.
    const refs = JSON.stringify(tool.inputSchema).match(/"\$ref":"[^"]*"/g) ?? [];
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(ref).toMatch(/"#\/properties\//);
  });

  it('validates tool calls with the tool\'s own zod schema', () => {
    const specs = toLlmTools([getObject, queryObjects]);
    const turn = interpretMessage(msg([
      toolUse('tu_1', 'get_object', { objectType: 'Customer', primaryKey: 'C1', rationale: why }),
      toolUse('tu_2', 'get_object', { objectType: 'Customer', rationale: why }),
    ], 'tool_use'), specs);
    expect(turn.toolCalls[0]).toMatchObject({ ok: true, input: { objectType: 'Customer', primaryKey: 'C1' } });
    expect(turn.toolCalls[1]).toMatchObject({ ok: false, code: 'BAD_ARGUMENTS', issues: [expect.objectContaining({ path: 'primaryKey' })] });
  });

  it('keeps the registry order, so the cached prefix is stable, and refuses a tool missing from the catalog', () => {
    const registry = buildToolRegistry();
    const specs = toLlmTools(registry.values());
    expect(specs.map((t) => t.name)).toEqual([...registry.keys()]);
    expect(JSON.stringify(toLlmTools(registry.values()))).toBe(JSON.stringify(specs));
    expect(() => toLlmTool({ ...getObject, name: 'not_a_tool' })).toThrow('no description');
  });
});

describe('anthropic gateway (fake client)', () => {
  /** A stand-in for client.beta.messages.stream: each call returns the next scripted outcome. */
  function fakeClient(outcomes: (BetaMessage | Error)[]) {
    const calls: unknown[] = [];
    const stream = vi.fn((params: unknown) => {
      calls.push(params);
      const next = outcomes.shift()!;
      return { on: () => undefined, finalMessage: () => (next instanceof Error ? Promise.reject(next) : Promise.resolve(next)) };
    });
    return { client: { beta: { messages: { stream } } } as unknown as Anthropic, calls };
  }

  it('re-issues a turn whose tool input JSON could not be parsed, then gives up', async () => {
    const ok = msg([{ type: 'text', text: 'ok' }], 'end_turn');
    const { client, calls } = fakeClient([new Error('Unexpected token in JSON'), ok]);
    const gw = new AnthropicGateway({ model: 'claude-opus-5-5', effort: 'high', client });
    expect((await gw.stream(req())).outcome).toBe('end_turn');
    expect(calls).toHaveLength(2);

    const bad = fakeClient([new Error('json'), new Error('json'), new Error('json')]);
    await expect(new AnthropicGateway({ model: 'claude-opus-5-5', effort: 'high', client: bad.client }).stream(req()))
      .rejects.toMatchObject({ code: 'LLM_INVALID_TOOL_JSON' });
  });

  it('maps API errors and never retries them itself (the SDK already did)', async () => {
    const headers = new Headers({ 'request-id': 'req_1' });
    const cases: [Error, string][] = [
      [new Anthropic.BadRequestError(400, { error: { message: 'bad' } }, 'bad', headers), 'LLM_BAD_REQUEST'],
      [new Anthropic.AuthenticationError(401, undefined, 'no', headers), 'LLM_AUTH'],
      [new Anthropic.RateLimitError(429, undefined, 'slow', headers), 'LLM_RATE_LIMITED'],
      [new Anthropic.InternalServerError(529, undefined, 'overloaded', headers), 'LLM_UNAVAILABLE'],
      [new Anthropic.APIConnectionError({ message: 'down' }), 'LLM_UNAVAILABLE'],
    ];
    for (const [error, code] of cases) {
      const { client, calls } = fakeClient([error]);
      const err = await new AnthropicGateway({ model: 'claude-opus-5-5', effort: 'high', client }).stream(req()).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(LlmError);
      expect(err).toMatchObject({ code });
      expect(calls).toHaveLength(1);
    }
  });
});

// One real call (T-21 "done when"): LLM_LIVE=1 with ANTHROPIC_API_KEY set. Costs a few cents.
describe.skipIf(process.env.LLM_LIVE !== '1')('anthropic gateway (live)', () => {
  it('returns a tool_use block that passes its schema', async () => {
    const gw = new AnthropicGateway({ model: process.env.LLM_MODEL ?? 'claude-opus-5-5', effort: 'low' });
    let thinking = '';
    const turn = await gw.stream({
      system: 'You are the agent of a data platform. Act through tools only.',
      tools: [...tools, ...toLlmTools([queryObjects, getObject])],
      messages: [{ role: 'user', content: 'Show me the first 5 rows of dataset ds_commandes. Use the preview_dataset tool, with a short rationale (title ≤ 60 chars, why ≤ 160 chars).' }],
    }, { onThinking: (d) => { thinking += d; } });
    expect(turn.outcome).toBe('tool_use');
    const call = turn.toolCalls.find((c) => c.name === 'preview_dataset');
    expect(call).toMatchObject({ ok: true, input: { datasetId: 'ds_commandes', limit: 5 } });
    console.log(JSON.stringify({ servedBy: turn.servedBy, fellBack: turn.fellBack, usage: turn.usage, thinkingChars: thinking.length }));
  }, 120_000);
});
