// Owner: Alfred (09 §3). The agent loop (05-agent §1): append-only items, one model turn per step, tool calls
// run in order, pauses for approvals (gated tools) and questions (ask_user), resumes with every result of the
// paused response in one user turn. The model's message list is rebuilt from the items on every step and
// never edited, so assistant content (thinking blocks included) is replayed byte-for-byte (G7).

import { randomUUID } from 'node:crypto';
import type { AgentMode, ClarifyingQuestion } from '@mini/shared';
import type { ZodTypeAny } from 'zod';
import { parseAssistantText } from '../modules/agent/blocks.js';
import type { AgentEventHub } from '../modules/agent/events.js';
import type { FreshFactsProvider } from '../modules/agent/facts.js';
import type { AgentStore } from '../modules/agent/store.js';
import type {
  AgentItem, AgentSessionRow, ExecResult, ItemPayloads, PendingState, Rationale, StoredResult, ToolResultContent,
} from '../modules/agent/types.js';
import type { User } from '../modules/resources/schemas.js';
import { fromMessageTrace, type TraceMessage } from '../modules/semantics/engine/trajectory.js';
import { LlmError, type BetaMessageParam, type LlmGateway, type LlmRequest, type LlmTool, type ToolCallCheck } from '../modules/llm/index.js';
import type { SemanticsPort } from '../ports.js';
import type { Services } from '../services.js';
import { buildSystemPrompt, modeGuide, promptTexts, renderFreshFacts, type PromptTexts } from './prompts/index.js';
import type { AnyToolDef, ToolContext, ToolResult } from './tools/types.js';

export const MAX_STEPS = 60;
export const MAX_CALLS_PER_RESPONSE = 6;
export const MAX_IDENTICAL_FAILURES = 3;
export const RESULT_MAX_CHARS = 6000;

export type LoopRuntime = {
  llm: LlmGateway;
  /** The registry: name → tool. */
  tools: Map<string, AnyToolDef>;
  /** All tools as Claude sees them, built once, same order in every mode and turn (cached prefix). */
  llmTools: LlmTool[];
  services: Services;
  semantics: SemanticsPort;
  facts: FreshFactsProvider;
  /** LLM_MAX_CONTEXT_TOKENS: past it, the request asks the API to clear old tool results. */
  contextBudget: number;
  maxSteps?: number;
  prompts?: PromptTexts;
  log?: (message: string, err?: unknown) => void;
};

type ProcessOutcome = { kind: 'paused' } | { kind: 'done'; results: ExecResult[] };

// ───────────── request building (pure) ─────────────

/** The model's messages, rebuilt from the items in order. UI-only items (tool_call, notes, approvals…) are skipped. */
export function buildMessages(items: AgentItem[]): BetaMessageParam[] {
  const messages: BetaMessageParam[] = [];
  for (const item of items) {
    switch (item.kind) {
      case 'user_message':
        messages.push({ role: 'user', content: item.payload.text });
        break;
      case 'assistant_message':
        // Replayed from the exact JSON text received; an empty content (e.g. a bare refusal) can't be sent back.
        if (item.payload.content.length > 0) {
          messages.push({ role: 'assistant', content: JSON.parse(item.payload.contentJson) as Extract<BetaMessageParam, { role: 'assistant' }>['content'] });
        }
        break;
      case 'tool_results':
        messages.push({ role: 'user', content: item.payload.content });
        break;
      case 'system_note':
        messages.push({ role: 'system', content: item.payload.text });
        break;
      default:
        break;
    }
  }
  return messages;
}

function resultBody(r: ToolResult): Record<string, unknown> {
  return r.ok
    ? { ok: true, summary: r.summary, result: r.result }
    : { ok: false, code: r.code, message: r.message, ...(r.hint ? { hint: r.hint } : {}) };
}

/** `<item seq tool tokens>` wrapper and the 6 000-character cap of 05-agent §7. */
export function renderToolResult(r: ExecResult): ToolResultContent {
  let text = JSON.stringify(resultBody(r.result)) ?? 'null';
  if (text.length > RESULT_MAX_CHARS) {
    text = JSON.stringify({
      ok: r.result.ok,
      ...(r.result.ok ? { summary: r.result.summary } : { code: r.result.code, message: r.result.message }),
      truncated: true,
      hint: `The result was cut at ${RESULT_MAX_CHARS} characters: narrow the query (fewer columns, a filter, a smaller limit or an aggregate).`,
      partial: text.slice(0, RESULT_MAX_CHARS),
    });
  }
  const tokens = Math.ceil(text.length / 4);
  return {
    type: 'tool_result',
    tool_use_id: r.callId,
    content: `<item seq="${r.callSeq}" tool="${r.tool}" tokens="${tokens}">${text}</item>`,
    ...(r.result.ok ? {} : { is_error: true }),
  };
}

function storedResult(r: ExecResult): StoredResult {
  return r.result.ok
    ? { callId: r.callId, tool: r.tool, callSeq: r.callSeq, ok: true, summary: r.result.summary, result: r.result.result }
    : {
        callId: r.callId, tool: r.tool, callSeq: r.callSeq, ok: false, summary: r.result.message,
        error: { code: r.result.code, message: r.result.message, ...(r.result.hint ? { hint: r.result.hint } : {}) },
      };
}

function withoutRationale(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const rest: Record<string, unknown> = { ...(input as Record<string, unknown>) };
  delete rest.rationale;
  return rest;
}

function rationaleOf(input: unknown): Rationale {
  const r = (input as { rationale?: Partial<Rationale> } | null)?.rationale;
  return { title: r?.title ?? '', why: r?.why ?? '' };
}

function findLast<K extends AgentItem['kind']>(items: AgentItem[], kind: K, pred: (i: Extract<AgentItem, { kind: K }>) => boolean = () => true) {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    if (item.kind === kind && pred(item as Extract<AgentItem, { kind: K }>)) return item as Extract<AgentItem, { kind: K }>;
  }
  return undefined;
}

function assistantText(content: ItemPayloads['assistant_message']['content']): string {
  return content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n\n');
}

// ───────────── the loop ─────────────

export class AgentLoop {
  private readonly stopRequested = new Set<string>();
  private readonly systemCache = new Map<string, string>();

  constructor(
    private readonly store: AgentStore,
    private readonly hub: AgentEventHub,
    private readonly rt: LoopRuntime,
  ) {}

  get runtime(): LoopRuntime {
    return this.rt;
  }

  requestStop(sessionId: string): void {
    this.stopRequested.add(sessionId);
  }

  clearStop(sessionId: string): void {
    this.stopRequested.delete(sessionId);
  }

  /** After a user message: runs steps until the model ends its turn, a pause, a stop or a limit. */
  async run(sessionId: string, user: User): Promise<void> {
    await this.steps(sessionId, user, {});
  }

  /** After an approval decision: the paused call's result, then the rest of the response, then the loop. */
  async resumeAfterApproval(
    sessionId: string, user: User, decision: 'allow' | 'reject', editedArgs?: Record<string, unknown>, note?: string,
  ): Promise<void> {
    const session = await this.store.getSession(sessionId);
    const pending = session.pending;
    if (!pending || pending.kind !== 'approval') throw new Error(`Session ${sessionId} is not waiting for an approval.`);
    const call = pending.calls[pending.index]!;
    let result: ToolResult;
    if (decision === 'reject') {
      result = {
        ok: false, code: 'REJECTED_BY_USER',
        message: `The user rejected this step${note ? `: ${note}` : '.'}`,
        hint: 'Do not retry the same call without a new instruction from the user.',
      };
    } else {
      const tool = this.rt.tools.get(call.name)!;
      const original = call.ok ? call.input : {};
      const schema: ZodTypeAny = tool.input;
      const parsed = schema.safeParse(editedArgs ? { ...(original as object), ...editedArgs } : original);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
        result = { ok: false, code: 'BAD_ARGUMENTS', message: `The edited arguments are invalid: ${issues}`, hint: 'Ask the user what they meant to change.' };
      } else {
        result = await this.runTool(tool, parsed.data, this.toolContext(session, user));
      }
    }
    await this.resume(session, pending, user, result);
  }

  /** After the user answered an ask_user call: the answers are its tool result. */
  async resumeAfterAnswer(sessionId: string, user: User, answers: Record<string, string | string[]>): Promise<void> {
    const session = await this.store.getSession(sessionId);
    const pending = session.pending;
    if (!pending || pending.kind !== 'question') throw new Error(`Session ${sessionId} is not waiting for an answer.`);
    const call = pending.calls[pending.index]!;
    const questions = call.ok ? (call.input as { questions: ClarifyingQuestion[] }).questions : [];
    const result: ToolResult = {
      ok: true,
      summary: 'The user answered.',
      result: { answers: questions.filter((q) => q.id in answers).map((q) => ({ id: q.id, question: q.text, answer: answers[q.id] })) },
    };
    await this.resume(session, pending, user, result);
  }

  /** Stop while paused: the paused call and the rest of its response get error results, then idle. */
  async cancelPause(sessionId: string): Promise<void> {
    const session = await this.store.getSession(sessionId);
    const pending = session.pending;
    if (pending) {
      const call = pending.calls[pending.index]!;
      const stopped: ExecResult = {
        callId: call.id, tool: call.name, callSeq: pending.callSeq, input: call.ok ? call.input : call.rawInput,
        result: { ok: false, code: 'STOPPED_BY_USER', message: 'The user stopped the conversation before this step ran.', hint: 'Wait for a new instruction.' },
      };
      if (pending.kind === 'approval' && pending.approvalId) {
        if (await this.store.decideApproval(pending.approvalId, 'rejected', session.userId, 'Stopped')) {
          await this.store.append(sessionId, 'approval_decision', { approvalId: pending.approvalId, decision: 'rejected', note: 'Stopped' });
        }
      }
      await this.closeOpenCalls(sessionId, [...pending.results, stopped], 'NOT_RUN', 'Not run: the user stopped the conversation.');
    }
    await this.store.append(sessionId, 'note', { text: 'Stopped as you asked.' });
    await this.store.updateSession(sessionId, { status: 'idle', pending: null });
  }

  /**
   * Gives an error result to every tool_use of the last assistant message that has none yet (`known` results
   * first), so the next request is valid. Used after a refusal, a stop while paused, or a crash.
   */
  async closeOpenCalls(sessionId: string, known: ExecResult[], code: string, message: string): Promise<void> {
    const items = await this.store.listItems(sessionId);
    const last = findLast(items, 'assistant_message');
    const answered = new Set<string>(known.map((r) => r.callId));
    if (last) {
      for (const item of items) {
        if (item.seq > last.seq && item.kind === 'tool_results') item.payload.results.forEach((r: StoredResult) => answered.add(r.callId));
      }
    }
    const open: ExecResult[] = (last?.payload.content ?? []).flatMap((b) =>
      b.type === 'tool_use' && !answered.has(b.id)
        ? [{ callId: b.id, tool: b.name, callSeq: last!.seq, input: b.input, result: { ok: false as const, code, message } }]
        : []);
    const results = [...known, ...open];
    if (results.length > 0) await this.appendResults(sessionId, results);
  }

  // ───────────── internals ─────────────

  private async resume(session: AgentSessionRow, pending: PendingState, user: User, pausedResult: ToolResult): Promise<void> {
    const call = pending.calls[pending.index]!;
    const results: ExecResult[] = [
      ...pending.results,
      { callId: call.id, tool: call.name, callSeq: pending.callSeq, input: call.ok ? call.input : call.rawInput, result: pausedResult },
    ];
    await this.store.updateSession(session.id, { status: 'running', pending: null });
    const outcome = await this.processCalls(session.id, user, pending.assistantSeq, pending.calls, pending.index + 1, results, pending.failures);
    if (outcome.kind === 'paused') return;
    if (await this.completeResponse(session.id, outcome.results, pending.failures)) return;
    await this.steps(session.id, user, pending.failures);
  }

  private async steps(sessionId: string, user: User, failures: Record<string, number>): Promise<void> {
    await this.store.updateSession(sessionId, { status: 'running' });
    const maxSteps = this.rt.maxSteps ?? MAX_STEPS;
    for (let step = 1; step <= maxSteps; step++) {
      if (this.stopRequested.delete(sessionId)) {
        await this.finish(sessionId, 'Stopped as you asked.');
        return;
      }
      const session = await this.store.getSession(sessionId);
      const items = await this.syncSystemNotes(session, await this.store.listItems(sessionId));
      const req: LlmRequest = {
        system: await this.systemPrompt(session),
        tools: this.rt.llmTools,
        messages: buildMessages(items),
        ...((await this.store.getSession(sessionId)).tokenEstimate > this.rt.contextBudget ? { contextEditing: true } : {}),
      };
      const seq = (items.at(-1)?.seq ?? 0) + 1;

      let turn;
      try {
        turn = await this.rt.llm.stream(req, {
          onText: (text) => this.hub.emit(sessionId, { type: 'delta', seq, text }),
          onThinking: (summary) => this.hub.emit(sessionId, { type: 'thinking', seq, summary }),
        });
      } catch (err) {
        this.rt.log?.('agent: model call failed', err);
        const text = err instanceof LlmError ? err.message : 'Something went wrong while talking to Claude.';
        await this.writeTrajectory(sessionId, 'failed', '');
        await this.finish(sessionId, `${text} Nothing else was done; send your message again to retry.`);
        return;
      }

      const content = turn.message.content;
      const text = assistantText(content);
      const contentJson = JSON.stringify(content);
      const assistant = await this.store.append(sessionId, 'assistant_message', {
        content,
        contentJson,
        blocks: parseAssistantText(text).blocks,
        stopReason: turn.message.stop_reason ?? null,
        servedBy: turn.servedBy,
        fellBack: turn.fellBack,
      }, contentJson);

      if (turn.outcome === 'refusal') {
        // No tool of a refused turn runs (G10); any tool_use it contains gets an error result.
        await this.closeOpenCalls(sessionId, [], 'NOT_RUN', 'Not run: the reply was declined.');
        await this.finish(sessionId, "I can't help with that request. Try rephrasing it, or ask something else about your data.");
        return;
      }

      const calls = turn.toolCalls;
      if (calls.length > 0) {
        const outcome = await this.processCalls(sessionId, user, assistant.seq, calls, 0, [], failures);
        if (outcome.kind === 'paused') return;
        if (await this.completeResponse(sessionId, outcome.results, failures)) return;
      }

      if (turn.outcome === 'max_tokens') {
        await this.store.append(sessionId, 'note', { text: 'The reply was cut off at the length limit; continuing.' });
        await this.store.append(sessionId, 'system_note', {
          text: 'Your previous reply was cut off at the output length limit. Continue where you stopped, in shorter steps.',
          about: 'continue',
        });
        continue;
      }
      if (calls.length > 0 || turn.outcome === 'pause_turn') continue;

      // The model ended its turn: an answer.
      await this.writeTrajectory(sessionId, 'answered', text);
      await this.store.updateSession(sessionId, { status: 'idle' });
      return;
    }
    await this.writeTrajectory(sessionId, 'failed', '');
    await this.finish(sessionId, `I stopped after ${maxSteps} steps without finishing. Tell me how to continue.`);
  }

  private async finish(sessionId: string, note: string): Promise<void> {
    await this.store.append(sessionId, 'note', { text: note });
    await this.store.updateSession(sessionId, { status: 'idle' });
  }

  /** Runs the calls of one response from `start`; pauses on a gated call or ask_user. */
  private async processCalls(
    sessionId: string, user: User, assistantSeq: number, calls: ToolCallCheck[], start: number,
    results: ExecResult[], failures: Record<string, number>,
  ): Promise<ProcessOutcome> {
    for (let i = start; i < calls.length; i++) {
      const call = calls[i]!;
      const session = await this.store.getSession(sessionId); // change_mode may have changed the mode
      const fail = (code: string, message: string, hint?: string) => {
        results.push({
          callId: call.id, tool: call.name, callSeq: assistantSeq, input: call.ok ? call.input : call.rawInput,
          result: { ok: false, code, message, ...(hint ? { hint } : {}) },
        });
      };

      if (i >= MAX_CALLS_PER_RESPONSE) {
        fail('TOO_MANY_TOOL_CALLS', `Only ${MAX_CALLS_PER_RESPONSE} tool calls run per reply; this one was skipped.`, 'Make fewer calls at once, then call it again.');
        continue;
      }
      // Same order as 05-agent §1: the mode first, then the arguments.
      const tool = this.rt.tools.get(call.name);
      if (!tool) {
        fail('UNKNOWN_TOOL', `There is no tool named "${call.name}".`, 'Use one of the declared tools.');
        continue;
      }
      if (!tool.modes.includes(session.mode)) {
        fail(
          'UNKNOWN_TOOL_FOR_MODE',
          `${call.name} is not available in ${session.mode} mode.`,
          `Call change_mode first: ${call.name} works in ${tool.modes.join(', ')} mode.`,
        );
        continue;
      }
      if (!call.ok) {
        if (call.code === 'TRUNCATED') fail('BAD_ARGUMENTS', call.message, 'Send a smaller input (fewer items per call).');
        else fail('BAD_ARGUMENTS', call.message, 'Fix the fields listed and call the tool again.');
        continue;
      }

      const toolCall = await this.store.append(sessionId, 'tool_call', {
        callId: call.id, tool: call.name, args: call.input, risk: tool.risk, rationale: rationaleOf(call.input),
      });
      const ctx = this.toolContext(session, user);

      if (tool.risk === 'gated') {
        let summary: string;
        try {
          summary = tool.summarize ? await tool.summarize(call.input, ctx) : `Run ${tool.name}`;
        } catch (err) {
          this.rt.log?.(`agent: summarize failed for ${tool.name}`, err);
          summary = rationaleOf(call.input).title || `Run ${tool.name}`;
        }
        const approvalId = await this.store.createApproval(sessionId, toolCall.seq, tool.name, call.input, summary);
        await this.store.append(sessionId, 'approval_request', { approvalId, tool: tool.name, summary, args: call.input, callSeq: toolCall.seq });
        await this.store.updateSession(sessionId, {
          status: 'awaiting_approval',
          pending: { kind: 'approval', approvalId, assistantSeq, calls, index: i, callSeq: toolCall.seq, results, failures },
        });
        return { kind: 'paused' };
      }

      if (tool.name === 'ask_user') {
        const questionId = randomUUID();
        const { questions } = call.input as { questions: ClarifyingQuestion[] };
        await this.store.append(sessionId, 'question', { questionId, questions, callSeq: toolCall.seq });
        await this.store.updateSession(sessionId, {
          status: 'awaiting_answer',
          pending: { kind: 'question', questionId, assistantSeq, calls, index: i, callSeq: toolCall.seq, results, failures },
        });
        return { kind: 'paused' };
      }

      const result = await this.runTool(tool, call.input, ctx);
      results.push({ callId: call.id, tool: call.name, callSeq: toolCall.seq, input: call.input, result });
      if (tool.name === 'change_mode' && result.ok) await this.applyModeChange(session, result.result);
    }
    return { kind: 'done', results };
  }

  /** Appends the one user turn with every result; true when the loop must stop on repeated identical failures. */
  private async completeResponse(sessionId: string, results: ExecResult[], failures: Record<string, number>): Promise<boolean> {
    await this.appendResults(sessionId, results);
    let repeated: ExecResult | undefined;
    for (const r of results) {
      if (r.result.ok) continue;
      const key = `${r.tool}|${JSON.stringify(withoutRationale(r.input))}|${r.result.code}`;
      failures[key] = (failures[key] ?? 0) + 1;
      if (failures[key]! >= MAX_IDENTICAL_FAILURES) repeated = r;
    }
    if (!repeated || repeated.result.ok) return false;
    await this.writeTrajectory(sessionId, 'failed', '');
    await this.finish(
      sessionId,
      `I stopped after the same step failed ${MAX_IDENTICAL_FAILURES} times (${repeated.tool}: ${repeated.result.message}). Tell me how you'd like to continue.`,
    );
    return true;
  }

  private async appendResults(sessionId: string, results: ExecResult[]): Promise<void> {
    const content = results.map(renderToolResult);
    await this.store.append(sessionId, 'tool_results', { results: results.map(storedResult), content }, content.map((c) => c.content).join(''));
  }

  private async runTool(tool: AnyToolDef, input: unknown, ctx: ToolContext): Promise<ToolResult> {
    try {
      return await tool.run(input, ctx);
    } catch (err) {
      // Tools return their errors; a throw is a bug, still reported to the model as a result.
      this.rt.log?.(`agent: tool ${tool.name} threw`, err);
      return { ok: false, code: 'TOOL_FAILED', message: `${tool.name} failed unexpectedly.`, hint: 'Try a different approach or tell the user.' };
    }
  }

  private async applyModeChange(session: AgentSessionRow, result: unknown): Promise<void> {
    const to = (result as { to?: AgentMode } | null)?.to;
    if (!to || to === session.mode) return;
    await this.store.updateSession(session.id, { mode: to });
    await this.store.append(session.id, 'mode_change', { from: session.mode, to });
  }

  private toolContext(session: AgentSessionRow, user: User): ToolContext {
    return { user, projectId: session.projectId, sessionId: session.id, mode: session.mode, services: this.rt.services, semantics: this.rt.semantics };
  }

  /** Top-level system: base prompt + project and owner names, fixed for the session's lifetime in this process (cache). */
  private async systemPrompt(session: AgentSessionRow): Promise<string> {
    let system = this.systemCache.get(session.id);
    if (system === undefined) {
      const owner = await this.rt.services.resources.getUser(session.userId);
      system = buildSystemPrompt(
        { projectName: await this.store.projectName(session.projectId), userDisplayName: owner?.displayName ?? '' },
        this.texts(),
      );
      this.systemCache.set(session.id, system);
    }
    return system;
  }

  private texts(): PromptTexts {
    return this.rt.prompts ?? promptTexts();
  }

  /** Mode guide and fresh facts as mid-conversation system messages, appended (as items) when they change. */
  private async syncSystemNotes(session: AgentSessionRow, items: AgentItem[]): Promise<AgentItem[]> {
    const added: AgentItem[] = [];
    const facts = renderFreshFacts(await this.rt.facts(session.projectId));
    const lastFacts = findLast(items, 'system_note', (i) => i.payload.about === 'facts');
    if (lastFacts?.payload.text !== facts) {
      added.push(await this.store.append(session.id, 'system_note', { text: facts, about: 'facts' }));
    }
    const lastMode = findLast(items, 'system_note', (i) => i.payload.about === 'mode');
    if (lastMode?.payload.mode !== session.mode) {
      added.push(await this.store.append(session.id, 'system_note', { text: modeGuide(session.mode, this.texts()), about: 'mode', mode: session.mode }));
    }
    return added.length > 0 ? [...items, ...added] : items;
  }

  /** G11: an explore answer writes a trajectory with the active semantic version and its browse / resolve calls. */
  private async writeTrajectory(sessionId: string, status: 'answered' | 'failed', answer: string): Promise<void> {
    try {
      const session = await this.store.getSession(sessionId);
      if (session.mode !== 'explore') return;
      const items = await this.store.listItems(sessionId);
      const question = findLast(items, 'user_message');
      if (!question) return;
      const calls = new Map<string, ItemPayloads['tool_call']>();
      const messages: TraceMessage[] = [];
      for (const item of items) {
        if (item.seq <= question.seq) continue;
        if (item.kind === 'tool_call') calls.set(item.payload.callId, item.payload);
        if (item.kind !== 'tool_results') continue;
        for (const r of item.payload.results) {
          const call = calls.get(r.callId);
          messages.push({ tool_call: { tool: r.tool, arguments: withoutRationale(call?.args ?? {}) } });
          messages.push({ tool_result: r.ok ? (r.result ?? r.summary) : r.error });
        }
      }
      const semVersion = (await this.rt.semantics.activeVersion(session.projectId)) ?? 'none';
      await this.rt.services.semantics.appendTrajectory(
        session.projectId,
        fromMessageTrace({ sessionId, question: question.payload.text, semVersion, messages, answer, status }),
      );
    } catch (err) {
      this.rt.log?.('agent: could not write the trajectory', err);
    }
  }
}
