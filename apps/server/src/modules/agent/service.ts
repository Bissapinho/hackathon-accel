import type { AgentItemView, ClarifyingQuestion } from '@mini/shared';
import { AgentLoop, type LoopRuntime } from '../../agent/loop.js';
import type { AnyToolDef } from '../../agent/tools/types.js';
import type { Db } from '../../db/index.js';
import { ApiError, notFound } from '../../errors.js';
import type { SemanticsPort } from '../../ports.js';
import type { Services } from '../../services.js';
import { toLlmTools, type LlmGateway } from '../llm/index.js';
import type { User } from '../resources/schemas.js';
import { AgentEventHub } from './events.js';
import { createFreshFactsProvider, type FreshFactsProvider } from './facts.js';
import type { AgentSessionView, AgentSessionWithItems, DecisionBody } from './schemas.js';
import { AgentStore, toItemView } from './store.js';
import type { AgentSessionRow } from './types.js';

// Agent sessions (T-22): creates sessions, accepts messages, decisions and answers, and runs the loop in the
// background after the route has answered 202. One loop per session at a time.

/** What the loop needs from the app; attached once the registry and services exist (registerAgentRoutes). */
export type AgentRuntimeDeps = {
  services: Services;
  tools: Map<string, AnyToolDef>;
  semantics: SemanticsPort;
  llm?: LlmGateway;
  facts?: FreshFactsProvider;
  maxSteps?: number;
  log?: (message: string, err?: unknown) => void;
};

export type AgentServiceOptions = { db: Db; tokenBudget: number };

const busy = (s: AgentSessionRow) =>
  new ApiError(409, 'SESSION_BUSY',
    s.status === 'awaiting_approval' ? 'The agent is waiting for your approval.'
      : s.status === 'awaiting_answer' ? 'The agent is waiting for your answer.'
        : 'The agent is still working on your last message.',
    { hint: s.status.startsWith('awaiting') ? 'Answer the card first, or stop the conversation.' : 'Wait for it to finish, or stop it.' });

export class AgentService {
  readonly hub = new AgentEventHub();
  readonly store: AgentStore;
  readonly tokenBudget: number;
  private loop: AgentLoop | undefined;
  private readonly active = new Map<string, Promise<void>>();

  constructor(opts: AgentServiceOptions) {
    this.tokenBudget = opts.tokenBudget;
    this.store = new AgentStore(opts.db, this.hub, opts.tokenBudget);
  }

  /** Binds the loop to the app's services, registry and gateway. The tool list is built here, once. */
  attach(deps: AgentRuntimeDeps): void {
    const llm = deps.llm ?? deps.services.llm;
    const runtime: LoopRuntime = {
      llm,
      tools: deps.tools,
      llmTools: toLlmTools(deps.tools.values()),
      services: deps.services,
      semantics: deps.semantics,
      facts: deps.facts ?? createFreshFactsProvider(this.store.raw),
      contextBudget: this.tokenBudget,
      ...(deps.maxSteps !== undefined ? { maxSteps: deps.maxSteps } : {}),
      ...(deps.log ? { log: deps.log } : {}),
    };
    this.loop = new AgentLoop(this.store, this.hub, runtime);
  }

  private requireLoop(): AgentLoop {
    if (!this.loop) throw new ApiError(503, 'AGENT_NOT_READY', 'The agent is not ready yet.', { hint: 'Try again in a moment.' });
    return this.loop;
  }

  // ---------- reads ----------

  async createSession(projectId: string, user: User, title?: string): Promise<AgentSessionView> {
    return this.view(await this.store.createSession(projectId, user.id, title));
  }

  async getSession(sessionId: string): Promise<AgentSessionRow> {
    return this.store.getSession(sessionId);
  }

  async getSessionWithItems(sessionId: string): Promise<AgentSessionWithItems> {
    const session = await this.store.getSession(sessionId);
    return { session: this.view(session), items: await this.itemViews(sessionId) };
  }

  async itemViews(sessionId: string, afterSeq = 0): Promise<AgentItemView[]> {
    return (await this.store.listItems(sessionId, afterSeq)).flatMap((i) => {
      const v = toItemView(i);
      return v ? [v] : [];
    });
  }

  view(s: AgentSessionRow): AgentSessionView {
    const waitingFor = s.pending?.kind === 'approval' && s.pending.approvalId
      ? { kind: 'approval' as const, approvalId: s.pending.approvalId }
      : s.pending?.kind === 'question' && s.pending.questionId
        ? { kind: 'question' as const, questionId: s.pending.questionId }
        : null;
    return {
      id: s.id, projectId: s.projectId, userId: s.userId, title: s.title, mode: s.mode, status: s.status, waitingFor,
      tokenEstimate: s.tokenEstimate, tokenBudget: this.tokenBudget, createdAt: s.createdAt, updatedAt: s.updatedAt,
    };
  }

  /** Resolves when the session's background loop (if any) has finished: for tests and graceful shutdown. */
  async settled(sessionId: string): Promise<void> {
    while (this.active.has(sessionId)) await this.active.get(sessionId);
  }

  isRunning(sessionId: string): boolean {
    return this.active.has(sessionId);
  }

  // ---------- writes ----------

  async postMessage(sessionId: string, user: User, text: string): Promise<AgentSessionView> {
    const loop = this.requireLoop();
    return this.exclusive(sessionId, async (session) => {
      if (session.status === 'awaiting_approval' || session.status === 'awaiting_answer') throw busy(session);
      // 'running' or 'error' with no loop in this process: a crash or restart left calls without results.
      if (session.status === 'running' || session.status === 'error') {
        await loop.closeOpenCalls(sessionId, [], 'NOT_RUN', 'Not run: the previous step was interrupted.');
      }
      if (session.title === 'New conversation') await this.store.updateSession(sessionId, { title: titleOf(text) });
      await this.store.append(sessionId, 'user_message', { text });
      const running = await this.store.updateSession(sessionId, { status: 'running', pending: null });
      return { session: running, work: () => loop.run(sessionId, user) };
    });
  }

  async decide(sessionId: string, approvalId: string, user: User, body: DecisionBody): Promise<AgentSessionView> {
    const loop = this.requireLoop();
    return this.exclusive(sessionId, async (session) => {
      const approval = await this.store.getApproval(approvalId);
      if (!approval || approval.session_id !== sessionId) {
        throw notFound('This approval', 'it does not belong to this conversation');
      }
      if (session.status !== 'awaiting_approval' || session.pending?.approvalId !== approvalId || approval.status !== 'pending') {
        throw new ApiError(409, 'NOT_AWAITING_APPROVAL', 'This approval was already decided.', { hint: 'Reload the conversation.' });
      }
      const decision = body.decision === 'allow' ? 'allowed' : 'rejected';
      if (!(await this.store.decideApproval(approvalId, decision, user.id, body.note))) {
        throw new ApiError(409, 'NOT_AWAITING_APPROVAL', 'This approval was already decided.', { hint: 'Reload the conversation.' });
      }
      await this.store.append(sessionId, 'approval_decision', { approvalId, decision, ...(body.note ? { note: body.note } : {}) });
      const running = await this.store.updateSession(sessionId, { status: 'running' });
      return { session: running, work: () => loop.resumeAfterApproval(sessionId, user, body.decision, body.editedArgs, body.note) };
    });
  }

  async answer(sessionId: string, questionId: string, user: User, answers: Record<string, string | string[]>): Promise<AgentSessionView> {
    const loop = this.requireLoop();
    return this.exclusive(sessionId, async (session) => {
      const pending = session.pending;
      if (session.status !== 'awaiting_answer' || pending?.kind !== 'question' || pending.questionId !== questionId) {
        throw new ApiError(409, 'NOT_AWAITING_ANSWER', 'The agent is not waiting for an answer to this question.', { hint: 'Reload the conversation.' });
      }
      const call = pending.calls[pending.index]!;
      const questions = call.ok ? (call.input as { questions: ClarifyingQuestion[] }).questions : [];
      checkAnswers(questions, answers);
      await this.store.append(sessionId, 'answer', { questionId, answers });
      const running = await this.store.updateSession(sessionId, { status: 'running' });
      return { session: running, work: () => loop.resumeAfterAnswer(sessionId, user, answers) };
    });
  }

  /** Running: stops after the current step. Paused: closes the pending calls and goes idle. */
  async stop(sessionId: string): Promise<AgentSessionView> {
    const loop = this.requireLoop();
    const session = await this.store.getSession(sessionId);
    if (this.active.has(sessionId)) {
      loop.requestStop(sessionId);
      return this.view(session);
    }
    if (session.status === 'awaiting_approval' || session.status === 'awaiting_answer') {
      return this.exclusive(sessionId, async () => {
        await loop.cancelPause(sessionId);
        return { session: await this.store.getSession(sessionId) };
      });
    }
    return this.view(session);
  }

  // ---------- concurrency ----------

  /**
   * Reserves the session (synchronously, so two requests can't both start a loop), runs `prepare`, then starts
   * its background work. Errors in `prepare` release the session and reach the route.
   */
  private async exclusive(
    sessionId: string,
    prepare: (session: AgentSessionRow) => Promise<{ session: AgentSessionRow; work?: () => Promise<void> }>,
  ): Promise<AgentSessionView> {
    if (this.active.has(sessionId)) throw busy({ status: 'running' } as AgentSessionRow);
    let release!: () => void;
    const reservation = new Promise<void>((r) => (release = r));
    this.active.set(sessionId, reservation);
    let work: (() => Promise<void>) | undefined;
    let session: AgentSessionRow;
    try {
      ({ session, work } = await prepare(await this.store.getSession(sessionId)));
    } catch (err) {
      this.active.delete(sessionId);
      release();
      throw err;
    }
    if (!work) {
      this.active.delete(sessionId);
      release();
      return this.view(session);
    }
    const task = this.background(sessionId, work).finally(() => {
      this.active.delete(sessionId);
      this.loop?.clearStop(sessionId);
      release();
    });
    this.active.set(sessionId, task);
    return this.view(session);
  }

  private async background(sessionId: string, work: () => Promise<void>): Promise<void> {
    // Let the route answer 202 before the loop starts.
    await new Promise((r) => setImmediate(r));
    try {
      await work();
    } catch (err) {
      this.loop?.runtime.log?.('agent: the loop failed', err);
      try {
        await this.loop?.closeOpenCalls(sessionId, [], 'NOT_RUN', 'Not run: the server hit an error.');
        await this.store.append(sessionId, 'note', { text: 'Something went wrong on the server and the agent stopped. Send a message to try again.' });
        await this.store.updateSession(sessionId, { status: 'error', pending: null });
      } catch {
        // The database itself may be down; the session stays as it was.
      }
    }
  }
}

function titleOf(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > 60 ? `${line.slice(0, 57)}…` : line;
}

function checkAnswers(questions: ClarifyingQuestion[], answers: Record<string, string | string[]>): void {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const details: { path: string; code: string; message: string }[] = [];
  for (const [id, value] of Object.entries(answers)) {
    const q = byId.get(id);
    if (!q) {
      details.push({ path: `answers.${id}`, code: 'unknown_question', message: 'There is no question with this id.' });
      continue;
    }
    const values = Array.isArray(value) ? value : [value];
    if (Array.isArray(value) && !q.multiple) {
      details.push({ path: `answers.${id}`, code: 'single_choice', message: 'This question takes one answer.' });
    }
    if (q.choices && q.allowFreeText === false) {
      const bad = values.filter((v) => !q.choices!.includes(v));
      if (bad.length > 0) details.push({ path: `answers.${id}`, code: 'not_a_choice', message: `Not one of the choices: ${bad.join(', ')}.` });
    }
  }
  if (Object.keys(answers).length === 0) details.push({ path: 'answers', code: 'empty', message: 'Answer at least one question.' });
  if (details.length > 0) throw new ApiError(400, 'VALIDATION_FAILED', 'Some answers are invalid.', { details });
}
