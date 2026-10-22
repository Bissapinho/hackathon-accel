import type { AgentItemView, AgentMode, AgentStatus } from '@mini/shared';
import { sql } from 'kysely';
import type { Db } from '../../db/index.js';
import { notFound } from '../../errors.js';
import { parseAssistantText } from './blocks.js';
import type { AgentEventHub } from './events.js';
import { agentDb, type AgentDb } from './tables.js';
import type { AgentItem, AgentSessionRow, ItemKind, ItemPayloads, PendingState } from './types.js';

// Sessions, append-only items and approvals (meta.agent_sessions / agent_items / approvals).
// Items are only ever INSERTed (CLAUDE.md rule 13); the session row and the approval rows are state.

/** chars / 4, the estimate of 05-agent §7. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

type SessionDbRow = {
  id: string; project_id: string; user_id: string; title: string; mode: AgentMode; status: AgentStatus;
  pending: PendingState | null; token_estimate: number; created_at: Date; updated_at: Date;
};

function sessionOf(r: SessionDbRow): AgentSessionRow {
  return {
    id: r.id, projectId: r.project_id, userId: r.user_id, title: r.title, mode: r.mode, status: r.status,
    pending: r.pending, tokenEstimate: r.token_estimate, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AgentStore {
  private readonly db: AgentDb;
  /** Appends of one session are serialized in-process so seqs never collide. */
  private readonly appendChains = new Map<string, Promise<unknown>>();

  constructor(db: Db, private readonly hub: AgentEventHub, private readonly tokenBudget: number) {
    this.db = agentDb(db);
  }

  // ---------- sessions ----------

  async createSession(projectId: string, userId: string, title?: string): Promise<AgentSessionRow> {
    const row = await this.db.insertInto('meta.agent_sessions')
      .values({ project_id: projectId, user_id: userId, ...(title ? { title } : {}) })
      .returningAll().executeTakeFirstOrThrow();
    return sessionOf(row as SessionDbRow);
  }

  async findSession(sessionId: string): Promise<AgentSessionRow | null> {
    if (!UUID.test(sessionId)) return null;
    const row = await this.db.selectFrom('meta.agent_sessions').selectAll().where('id', '=', sessionId).executeTakeFirst();
    return row ? sessionOf(row as SessionDbRow) : null;
  }

  async getSession(sessionId: string): Promise<AgentSessionRow> {
    const s = await this.findSession(sessionId);
    if (!s) throw notFound('This conversation', 'there is no agent session with this id', 'Create one with POST /api/projects/:pid/agent/sessions.');
    return s;
  }

  async updateSession(
    sessionId: string,
    patch: Partial<{ title: string; mode: AgentMode; status: AgentStatus; pending: PendingState | null }>,
  ): Promise<AgentSessionRow> {
    const row = await this.db.updateTable('meta.agent_sessions')
      .set({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.mode !== undefined ? { mode: patch.mode } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.pending !== undefined ? { pending: patch.pending === null ? null : JSON.stringify(patch.pending) } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', sessionId).returningAll().executeTakeFirstOrThrow();
    const session = sessionOf(row as SessionDbRow);
    if (patch.status !== undefined || patch.mode !== undefined) {
      this.hub.emit(sessionId, { type: 'status', status: session.status, mode: session.mode });
    }
    return session;
  }

  // ---------- items (append-only) ----------

  async append<K extends ItemKind>(sessionId: string, kind: K, payload: ItemPayloads[K], tokenText?: string): Promise<AgentItem<K>> {
    const previous = this.appendChains.get(sessionId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => this.insertItem(sessionId, kind, payload, tokenText));
    this.appendChains.set(sessionId, next);
    try {
      return await next;
    } finally {
      if (this.appendChains.get(sessionId) === next) this.appendChains.delete(sessionId);
    }
  }

  private async insertItem<K extends ItemKind>(sessionId: string, kind: K, payload: ItemPayloads[K], tokenText?: string): Promise<AgentItem<K>> {
    const json = JSON.stringify(payload);
    const tokens = estimateTokens(tokenText ?? json);
    const { seq, total, createdAt } = await this.db.transaction().execute(async (trx) => {
      const inserted = await sql<{ seq: number; created_at: Date }>`
        INSERT INTO meta.agent_items (session_id, seq, kind, payload, token_estimate)
        SELECT ${sessionId}::uuid, COALESCE(MAX(seq), 0) + 1, ${kind}, ${json}::jsonb, ${tokens}
        FROM meta.agent_items WHERE session_id = ${sessionId}::uuid
        RETURNING seq, created_at`.execute(trx);
      const row = inserted.rows[0]!;
      const s = await trx.updateTable('meta.agent_sessions')
        .set((eb) => ({ token_estimate: eb('token_estimate', '+', tokens), updated_at: new Date() }))
        .where('id', '=', sessionId).returning('token_estimate').executeTakeFirstOrThrow();
      return { seq: row.seq, total: s.token_estimate, createdAt: row.created_at };
    });
    const item = { seq, kind, payload, tokenEstimate: tokens, createdAt: createdAt.toISOString() } as AgentItem<K>;
    const view = toItemView(item);
    if (view) this.hub.emit(sessionId, { type: 'item', item: view });
    this.hub.emit(sessionId, { type: 'tokens', used: total, budget: this.tokenBudget });
    return item;
  }

  async listItems(sessionId: string, afterSeq = 0): Promise<AgentItem[]> {
    const rows = await this.db.selectFrom('meta.agent_items').select(['seq', 'kind', 'payload', 'token_estimate', 'created_at'])
      .where('session_id', '=', sessionId).where('seq', '>', afterSeq).orderBy('seq').execute();
    return rows.map((r) => ({
      seq: r.seq, kind: r.kind, payload: r.payload, tokenEstimate: r.token_estimate, createdAt: r.created_at.toISOString(),
    }) as AgentItem);
  }

  async nextSeq(sessionId: string): Promise<number> {
    const r = await this.db.selectFrom('meta.agent_items').select((eb) => eb.fn.max('seq').as('m'))
      .where('session_id', '=', sessionId).executeTakeFirst();
    return Number(r?.m ?? 0) + 1;
  }

  // ---------- approvals ----------

  async createApproval(sessionId: string, itemSeq: number, tool: string, args: unknown, summary: string): Promise<string> {
    const row = await this.db.insertInto('meta.approvals')
      .values({ session_id: sessionId, item_seq: itemSeq, tool_name: tool, args: JSON.stringify(args), summary })
      .returning('id').executeTakeFirstOrThrow();
    return row.id;
  }

  async getApproval(approvalId: string) {
    if (!UUID.test(approvalId)) return null;
    return (await this.db.selectFrom('meta.approvals').selectAll().where('id', '=', approvalId).executeTakeFirst()) ?? null;
  }

  async decideApproval(approvalId: string, status: 'allowed' | 'rejected', userId: string, note?: string): Promise<boolean> {
    const r = await this.db.updateTable('meta.approvals')
      .set({ status, decided_by: userId, decided_at: new Date(), note: note ?? null })
      .where('id', '=', approvalId).where('status', '=', 'pending').executeTakeFirst();
    return Number(r.numUpdatedRows) === 1;
  }

  // ---------- facts used by the loop ----------

  async projectName(projectId: string): Promise<string> {
    const r = await this.db.selectFrom('meta.projects').select('name').where('id', '=', projectId).executeTakeFirst();
    return r?.name ?? '';
  }

  get raw(): AgentDb {
    return this.db;
  }
}

/** Items as the UI sees them (AgentItemView). System notes are for the model only: null. */
export function toItemView(item: AgentItem): AgentItemView | null {
  const { seq } = item;
  switch (item.kind) {
    case 'user_message':
      return { seq, kind: 'user_message', text: item.payload.text };
    case 'assistant_message': {
      const text = item.payload.content
        .flatMap((b) => (b.type === 'text' ? [b.text] : []))
        .join('\n\n');
      const parsed = parseAssistantText(text);
      return { seq, kind: 'assistant_message', text: parsed.text, blocks: parsed.blocks };
    }
    case 'tool_call':
      return {
        seq, kind: 'tool_call', tool: item.payload.tool, title: item.payload.rationale.title, why: item.payload.rationale.why,
        args: item.payload.args, risk: item.payload.risk,
      };
    case 'tool_results':
      return {
        seq, kind: 'tool_results',
        results: item.payload.results.map((r) => ({
          tool: r.tool, callSeq: r.callSeq, ok: r.ok, summary: r.summary, details: r.ok ? r.result : r.error,
        })),
      };
    case 'approval_request':
      return { seq, kind: 'approval_request', approvalId: item.payload.approvalId, tool: item.payload.tool, summary: item.payload.summary, args: item.payload.args };
    case 'approval_decision':
      return {
        seq, kind: 'approval_decision', approvalId: item.payload.approvalId, decision: item.payload.decision,
        ...(item.payload.note ? { note: item.payload.note } : {}),
      };
    case 'question':
      return { seq, kind: 'question', questionId: item.payload.questionId, questions: item.payload.questions };
    case 'answer':
      return { seq, kind: 'answer', questionId: item.payload.questionId, answers: item.payload.answers };
    case 'mode_change':
      return { seq, kind: 'mode_change', from: item.payload.from, to: item.payload.to };
    case 'note':
      return { seq, kind: 'note', text: item.payload.text };
    case 'system_note':
      return null;
  }
}
